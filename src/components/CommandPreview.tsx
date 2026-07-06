import React, { useState, useEffect } from 'react';
import { Command, CommandPreviewData, CommandContextState } from '../domain/command';
import { getSafeCommandContext } from './universalCommandBarContext';

interface Props {
  command: Command | null;
  context: CommandContextState;
  onClose: () => void;
}

const normalizePreview = async (preview: NonNullable<Command['preview']>, context: CommandContextState): Promise<CommandPreviewData | string | null> => {
  if (typeof preview === 'function') {
    return await preview(context);
  }
  return preview;
};

export const CommandPreview: React.FC<Props> = ({ command, context, onClose }) => {
  const [preview, setPreview] = useState<CommandPreviewData | string | null>(null);
  const [subMenuCommands, setSubMenuCommands] = useState<Command[] | null>(null);
  const safeContext = getSafeCommandContext(context);

  useEffect(() => {
    let active = true;
    const loadPreview = async () => {
      if (!command || !command.preview) {
        setPreview(null);
        return;
      }
      const data = await normalizePreview(command.preview, safeContext);
      if (!active) return;
      setPreview(data);
    };

    if (command?.subMenu) {
      Promise.resolve(command.subMenu(safeContext)).then((items) => {
        if (!active) return;
        setSubMenuCommands(items || []);
      }).catch(() => {
        if (!active) return;
        setSubMenuCommands([]);
      });
    } else {
      setSubMenuCommands(null);
    }

    loadPreview();

    return () => {
      active = false;
    };
  }, [command, safeContext, safeContext.workspaceId, safeContext.activeEntity?.entityId, safeContext.activeEntity?.entityType, safeContext.activePassportId, safeContext.activeEvidenceId, safeContext.activeFileId, safeContext.activeGraphNodeId, safeContext.activeIntegrationId, safeContext.activeUserId, safeContext.currentRoute, safeContext.workspaceRefreshKey]);

  if (!command) {
    return (
      <div className="ucb-preview">
        <div className="ucb-preview-header">Command preview</div>
        <div className="ucb-preview-empty">Select a command to see details</div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="ucb-preview">
        <div className="ucb-preview-header">Command preview</div>
        <div className="ucb-preview-loading">Loading preview…</div>
      </div>
    );
  }

  const previewData = typeof preview === 'string' ? { title: preview } : preview;

  return (
    <div className="ucb-preview">
      <div className="ucb-preview-header">Command preview</div>
      <div className="ucb-preview-label">{previewData.title}</div>
      {previewData.description && <div className="ucb-preview-desc">{previewData.description}</div>}
      {previewData.meta && (
        <ul className="ucb-meta">
          {Object.entries(previewData.meta).map(([key, value]) => (
            <li key={key}>
              <strong>{key}:</strong> {String(value)}
            </li>
          ))}
        </ul>
      )}
      {previewData.fields?.length > 0 && (
        <div className="ucb-preview-fields">
          {previewData.fields.map((field) => (
            <div key={field.label} className="ucb-preview-field">
              <strong>{field.label}:</strong>
              {field.editable ? (
                <input
                  className="ucb-preview-field-input"
                  defaultValue={field.value}
                  onBlur={async (e) => {
                    const newValue = e.target.value.trim();
                    if (newValue !== field.value) {
                      await field.onEdit?.(newValue, safeContext);
                    }
                  }}
                />
              ) : (
                <span>{field.value}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {previewData.actions?.length > 0 && (
        <div className="ucb-preview-actions">
          {previewData.actions.map((action) => (
            <button
              key={action.label}
              className="ucb-preview-action"
              onClick={async () => {
                await action.run(safeContext);
                onClose();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      {previewData.navigation?.length > 0 && (
        <div className="ucb-preview-navigation">
          {previewData.navigation.map((nav) => (
            <button
              key={nav.label}
              className="ucb-preview-navigation-action"
              onClick={() => {
                nav.navigate(safeContext);
                onClose();
              }}
            >
              {nav.label}
            </button>
          ))}
        </div>
      )}
      {subMenuCommands?.length > 0 && (
        <div className="ucb-preview-submenu">
          <div className="ucb-preview-submenu-title">Entity actions</div>
          {subMenuCommands.map((child) => (
            <button
              key={child.id}
              className="ucb-preview-action"
              onClick={async () => {
                await child.run({
                  ...safeContext,
                  onSuccess: (msg?: string) => {
                    if (msg) console.info(msg);
                  },
                  onError: (err?: string) => {
                    if (err) console.error(err);
                  },
                });
                onClose();
              }}
            >
              {child.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
