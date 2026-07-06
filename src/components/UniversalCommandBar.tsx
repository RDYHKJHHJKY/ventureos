/**
 * Universal Command Bar Component
 * Primary interaction surface for SPR operations
 */

import React, { useState, useEffect, useRef } from 'react';
import { Command, CommandContextState } from '../domain/command';
import { searchCommands } from '../utils/fuzzySearch';
import { CommandPreview } from './CommandPreview';
import { isCommandContextAvailable } from './universalCommandBarContext';
import './UniversalCommandBar.css';

interface Props {
  context: CommandContextState;
  isOpen: boolean;
  onClose: () => void;
  allCommands: Command[];
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export const UniversalCommandBar: React.FC<Props> = ({
  context,
  isOpen,
  onClose,
  allCommands,
}) => {
  const [query, setQuery] = useState('');
  const [filtered, setFiltered] = useState<Array<{ command: Command; score: number }>>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeCommand, setActiveCommand] = useState<Command | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [stepInput, setStepInput] = useState('');
  const [stepError, setStepError] = useState<string | null>(null);
  const [stepState, setStepState] = useState<Record<string, any>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedCommand = filtered[selectedIndex]?.command;
  const activeStep = activeCommand?.steps?.[activeStepIndex] || null;

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const isContextAvailable = (cmd: Command) => isCommandContextAvailable(context, cmd);

  // Filter commands based on query and active context
  useEffect(() => {
    const filteredCommands = allCommands.filter((cmd) => isContextAvailable(cmd));
    const results = searchCommands(query, filteredCommands);
    setFiltered(results);
    setSelectedIndex((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [query, allCommands, context]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedIndex(0);
    } else if (selectedIndex >= filtered.length) {
      setSelectedIndex(filtered.length - 1);
    }
  }, [filtered.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('.ucb-item');
      if (items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, message, type }]);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const executeCommand = async (cmd: Command) => {
    if (!isContextAvailable(cmd)) {
      showToast('This command requires additional context to run', 'error');
      return;
    }

    if (cmd.steps && cmd.steps.length > 0) {
      setActiveCommand(cmd);
      setActiveStepIndex(0);
      setStepInput('');
      setStepError(null);
      setStepState({});
      return;
    }

    setIsLoading(true);
    try {
      await cmd.run({
        ...context,
        onSuccess: (msg: string) => showToast(msg, 'success'),
        onError: (err: string) => showToast(err, 'error'),
      });
      if (cmd.chain) {
        const chained = await cmd.chain(context);
        for (const nextCmd of chained) {
          await nextCmd.run({
            ...context,
            onSuccess: (msg: string) => showToast(msg, 'success'),
            onError: (err: string) => showToast(err, 'error'),
          });
        }
      }
      context.refreshWorkspace?.();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Command failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (activeStep) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = filtered[selectedIndex];
      if (result) {
        executeCommand(result.command);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (activeStep) {
        setActiveCommand(null);
        setActiveStepIndex(0);
        setStepInput('');
        setStepError(null);
        return;
      }
      onClose();
    }
  };

  if (!isOpen) return null;

  const handleStepKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeStep) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      const input = stepInput.trim();
      if (activeStep.validate && !activeStep.validate(input)) {
        setStepError('Please provide a valid value.');
        return;
      }

      setIsLoading(true);
      try {
        const result = await activeStep.run(input, context, stepState);
        if (Array.isArray(result) && result.length > 0) {
          for (const nextCmd of result) {
            await nextCmd.run({
              ...context,
              onSuccess: (msg: string) => showToast(msg, 'success'),
              onError: (err: string) => showToast(err, 'error'),
            });
          }
        }
        context.refreshWorkspace?.();
        const nextIndex = activeStepIndex + 1;
        if (activeCommand?.steps && nextIndex < activeCommand.steps.length) {
          setActiveStepIndex(nextIndex);
          setStepInput('');
          setStepError(null);
          setStepState((prev) => ({ ...prev, [activeStep.prompt]: input }));
        } else {
          onClose();
          setActiveCommand(null);
          setActiveStepIndex(0);
          setStepInput('');
          setStepError(null);
        }
      } catch (err: any) {
        setStepError(err.message || 'Step execution failed.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <>
      {/* Overlay */}
      <div className="ucb-overlay" onClick={onClose} />

      {/* Command bar */}
      <div className="ucb-container">
        <div className="ucb-header">
          <input
            ref={inputRef}
            className="ucb-input"
            placeholder="Type a command…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <div className="ucb-status">
            {isLoading && <span className="ucb-loading">⟳</span>}
            <span className="ucb-hint">↑↓ navigate • ↵ execute • Esc close</span>
          </div>
        </div>

        <div className="ucb-body">
          <div className="ucb-list" ref={listRef}>
            {activeStep ? (
              <div className="ucb-step">
                <div className="ucb-step-prompt">{activeStep.prompt}</div>
                <input
                  className="ucb-step-input"
                  value={stepInput}
                  placeholder={activeStep.placeholder || ''}
                  onChange={(e) => {
                    setStepInput(e.target.value);
                    setStepError(null);
                  }}
                  onKeyDown={handleStepKeyDown}
                  disabled={isLoading}
                  autoFocus
                />
                {stepError && <div className="ucb-step-error">{stepError}</div>}
                <div className="ucb-step-help">Press Enter to continue or Esc to cancel.</div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="ucb-empty">
                <span className="ucb-empty-icon">○</span>
                <span className="ucb-empty-text">No commands found</span>
                <span className="ucb-empty-tip">Try a different search term</span>
              </div>
            ) : (
              filtered.map((result, idx) => {
                const cmd = result.command;
                return (
                  <div
                    key={cmd.id}
                    className={`ucb-item ${idx === selectedIndex ? 'selected' : ''} ${
                      cmd.disabled ? 'disabled' : ''
                    }`}
                    onClick={() => {
                      setSelectedIndex(idx);
                      if (!cmd.disabled) {
                        executeCommand(cmd);
                      }
                    }}
                  >
                    <div className="ucb-item-icon">
                      {getIcon(cmd.icon)}
                    </div>
                    <div className="ucb-item-content">
                      <div className="ucb-item-label">{cmd.label}</div>
                      {cmd.description && (
                        <div className="ucb-item-desc">{cmd.description}</div>
                      )}
                      {cmd.disabled && cmd.disabledReason && (
                        <div className="ucb-item-disabled">{cmd.disabledReason}</div>
                      )}
                    </div>
                    <div className="ucb-item-scope">{cmd.scope}</div>
                  </div>
                );
              })
            )}
          </div>

          <CommandPreview command={activeCommand || selectedCommand || null} context={context} onClose={onClose} />
        </div>
      </div>

      {/* Toasts */}
      <div className="ucb-toasts">
        {toasts.map(toast => (
          <div key={toast.id} className={`ucb-toast ucb-toast-${toast.type}`}>
            <span className="ucb-toast-icon">
              {toast.type === 'success' && '✓'}
              {toast.type === 'error' && '✕'}
              {toast.type === 'info' && 'ℹ'}
            </span>
            <span className="ucb-toast-message">{toast.message}</span>
          </div>
        ))}
      </div>
    </>
  );
};

/**
 * Icon renderer
 */
function getIcon(iconName?: string): React.ReactNode {
  const icons: Record<string, string> = {
    passport: '📜',
    evidence: '🔍',
    key: '🔑',
    file: '📄',
    user: '👤',
    plus: '➕',
    rotate: '⟳',
    search: '🔎',
    alert: '⚠️',
    check: '✓',
  };

  return <span className="ucb-icon">{icons[iconName || 'search'] || '•'}</span>;
}
