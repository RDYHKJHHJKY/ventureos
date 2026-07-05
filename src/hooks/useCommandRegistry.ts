/**
 * Command registry hook
 * Defines all available commands for the universal command bar
 */

import { useMemo } from 'react';
import { Command, CommandContextState } from '../domain/command';
import { apiJson } from '../api-client';

const promptInput = (message: string, placeholder = '') => {
  if (typeof window === 'undefined') return null;
  const value = window.prompt(message, placeholder);
  return value ? String(value).trim() : null;
};

const createPassportCommandSet = (context: CommandContextState): Command[] => {
  const commands: Command[] = [
    {
      id: 'passport.create',
      label: 'Create new passport',
      description: 'Issue a new software passport for the current workspace',
      scope: 'passport',
      icon: 'passport',
      keywords: ['new', 'passport', 'create', 'issue', 'software', 'trust'],
      requiredContext: ['workspace'],
      steps: [
        {
          prompt: 'Enter passport name',
          placeholder: 'e.g. Billing Service',
          validate: (input: string) => input.length > 2,
          run: async (name, ctx) => {
            await apiJson('/api/passports', {
              method: 'POST',
              body: JSON.stringify({
                workspaceId: ctx.workspaceId,
                softwareId: name,
                status: 'draft',
              }),
            });
          },
        },
      ],
      run: async () => {
        // Step-driven command; the actual work is handled by the step engine.
      },
      preview: {
        title: 'Create a new passport',
        description: 'Enter a name and create a draft passport in the current workspace.',
      },
    },
    {
      id: 'passport.renew',
      label: 'Renew active passport',
      description: 'Extend expiration for the current passport',
      scope: 'passport',
      icon: 'rotate',
      keywords: ['renew', 'passport', 'extend', 'expiry', 'refresh'],
      requiredContext: ['passport'],
      run: async ({ activePassportId, onSuccess, onError }) => {
        if (!activePassportId) {
          onError?.('No active passport selected');
          return;
        }
        try {
          const result = await apiJson(`/api/passports/${encodeURIComponent(activePassportId)}/renew`, { method: 'POST' });
          if (result.ok) {
            onSuccess?.(`Passport renewed until ${result.expiresAt || 'unknown'}`);
          }
        } catch (err: any) {
          onError?.(err.message || 'Failed to renew passport');
        }
      },
      chain: async ({ activePassportId }) => {
        if (!activePassportId) return [];
        return [
          {
            id: `passport.open.${activePassportId}`,
            label: `Open passport ${activePassportId}`,
            description: 'Navigate to the renewed passport',
            scope: 'passport',
            icon: 'passport',
            keywords: ['open', 'passport', 'renewed'],
            run: async () => {
              if (typeof window !== 'undefined') {
                window.history.pushState({}, '', `/passport/${encodeURIComponent(activePassportId)}`);
                window.dispatchEvent(new Event('popstate'));
              }
            },
          },
        ];
      },
    },
    {
      id: 'passport.revoke',
      label: 'Revoke active passport',
      description: 'Revoke the current passport immediately',
      scope: 'passport',
      icon: 'alert',
      keywords: ['revoke', 'passport', 'cancel', 'block', 'reject'],
      requiredContext: ['passport'],
      run: async ({ activePassportId, onSuccess, onError }) => {
        if (!activePassportId) {
          onError?.('No active passport selected');
          return;
        }
        try {
          const result = await apiJson(`/api/passports/${encodeURIComponent(activePassportId)}/revoke`, { method: 'POST' });
          if (result.ok) {
            onSuccess?.('Passport revoked');
          }
        } catch (err: any) {
          onError?.(err.message || 'Failed to revoke passport');
        }
      },
    },
    {
      id: 'passport.activate',
      label: 'Activate active passport',
      description: 'Re-activate the current passport if it has been revoked',
      scope: 'passport',
      icon: 'check',
      keywords: ['activate', 'passport', 'enable', 'restore'],
      requiredContext: ['passport'],
      run: async ({ activePassportId, onSuccess, onError }) => {
        if (!activePassportId) {
          onSuccess?.('No active passport selected');
          return;
        }
        try {
          const result = await apiJson(`/api/passports/${encodeURIComponent(activePassportId)}/activate`, { method: 'POST' });
          if (result.ok) {
            onSuccess?.('Passport re-activated');
          }
        } catch (err: any) {
          onError?.(err.message || 'Failed to activate passport');
        }
      },
    },
    {
      id: 'passport.publish',
      label: 'Make active passport public',
      description: 'Expose the current passport as a public record',
      scope: 'passport',
      icon: 'passport',
      keywords: ['public', 'publish', 'passport', 'share'],
      requiredContext: ['passport'],
      run: async ({ activePassportId, onSuccess, onError }) => {
        if (!activePassportId) {
          onError?.('No active passport selected');
          return;
        }
        try {
          const result = await apiJson(`/api/passports/${encodeURIComponent(activePassportId)}/set-public`, { method: 'POST' });
          if (result.ok) {
            onSuccess?.('Passport set to public visibility');
          }
        } catch (err: any) {
          onError?.(err.message || 'Failed to publish passport');
        }
      },
    },
    {
      id: 'passport.unpublish',
      label: 'Make active passport private',
      description: 'Hide the current passport from public view',
      scope: 'passport',
      icon: 'passport',
      keywords: ['private', 'hide', 'passport', 'unpublish'],
      requiredContext: ['passport'],
      run: async ({ activePassportId, onSuccess, onError }) => {
        if (!activePassportId) {
          onError?.('No active passport selected');
          return;
        }
        try {
          const result = await apiJson(`/api/passports/${encodeURIComponent(activePassportId)}/set-private`, { method: 'POST' });
          if (result.ok) {
            onSuccess?.('Passport set to private visibility');
          }
        } catch (err: any) {
          onError?.(err.message || 'Failed to unpublish passport');
        }
      },
    },
    {
      id: 'passport.list',
      label: 'List all passports',
      description: 'Load all passports for the current workspace',
      scope: 'passport',
      icon: 'passport',
      keywords: ['list', 'passports', 'view', 'all', 'show'],
      requiredContext: ['workspace'],
      run: async ({ workspaceId, onSuccess, onError }) => {
        try {
          const result = await apiJson(`/api/passports?workspace=${encodeURIComponent(workspaceId)}`);
          if (result.ok) {
            const count = result.passports?.length || 0;
            onSuccess?.(`Loaded ${count} passports`);
          }
        } catch (err: any) {
          onError?.(err.message || 'Failed to list passports');
        }
      },
    },
  ];

  if (context.activePassportId) {
    commands.push({
      id: 'passport.open-active',
      label: 'Open active passport page',
      description: 'Navigate to the currently selected passport',
      scope: 'passport',
      icon: 'passport',
      keywords: ['open', 'view', 'passport', 'active'],
      requiredContext: ['passport'],
      preview: async () => {
        if (!context.workspaceId) {
          return { title: 'Active passport', description: 'No workspace context available.' };
        }
        const result = await apiJson(`/api/passports?workspace=${encodeURIComponent(context.workspaceId)}`);
        const passport = result.passports?.find((item: any) => item.id === context.activePassportId);
        return {
          title: passport?.name || `Passport ${context.activePassportId}`,
          description: passport?.summary || passport?.status || 'Selected passport details',
          meta: {
            Status: passport?.status || 'unknown',
            Trust: passport?.trust ?? 'unknown',
            Issued: passport?.issued ?? 'unknown',
            Expires: passport?.expiresAt ?? 'unknown',
          },
          actions: [
            {
              label: 'Open passport',
              run: async () => {
                if (typeof window !== 'undefined') {
                  window.history.pushState({}, '', `/passport/${encodeURIComponent(context.activePassportId!)}`);
                  window.dispatchEvent(new Event('popstate'));
                }
              },
            },
          ],
          navigation: [
            {
              label: 'View scoring',
              navigate: async () => {
                if (typeof window !== 'undefined') {
                  window.history.pushState({}, '', `/passport/${encodeURIComponent(context.activePassportId!)}?tab=scoring`);
                  window.dispatchEvent(new Event('popstate'));
                }
              },
            },
            {
              label: 'View audit chain',
              navigate: async () => {
                if (typeof window !== 'undefined') {
                  window.history.pushState({}, '', `/passport/${encodeURIComponent(context.activePassportId!)}?tab=audit`);
                  window.dispatchEvent(new Event('popstate'));
                }
              },
            },
          ],
        };
      },
    });

    commands.push({
      id: 'passport.menu',
      label: 'Passport actions',
      description: 'Open passport-specific actions and shortcuts',
      scope: 'passport',
      icon: 'passport',
      keywords: ['passport', 'actions', 'menu', 'entity', 'context'],
      requiredContext: ['passport'],
      subMenu: async (ctx) => {
        const passportId = ctx.activePassportId!;
        return [
          {
            id: `passport.open.${passportId}`,
            label: 'Open passport',
            description: 'Navigate to the currently selected passport',
            scope: 'passport',
            icon: 'passport',
            keywords: ['open', 'passport', 'view'],
            run: async () => {
              if (typeof window !== 'undefined') {
                window.history.pushState({}, '', `/passport/${encodeURIComponent(passportId)}`);
                window.dispatchEvent(new Event('popstate'));
              }
            },
          },
          {
            id: `passport.rename.${passportId}`,
            label: 'Rename passport',
            description: 'Rename the selected passport',
            scope: 'passport',
            icon: 'rotate',
            keywords: ['rename', 'passport', 'name', 'edit'],
            steps: [
              {
                prompt: 'Enter new passport name',
                placeholder: 'New passport name',
                validate: (input: string) => input.length > 2,
                run: async (name, ctx) => {
                  await apiJson(`/api/passports/${encodeURIComponent(passportId)}`, { method: 'PATCH', body: JSON.stringify({
                    name,
                  }) });
                },
              },
            ],
            run: async () => {
              // step-driven menu command
            },
          },
          {
            id: `passport.delete.${passportId}`,
            label: 'Delete passport',
            description: 'Delete the current passport',
            scope: 'passport',
            icon: 'alert',
            keywords: ['delete', 'passport', 'remove', 'destroy'],
            run: async ({ onSuccess, onError }) => {
              try {
                await apiJson(`/api/passports/${encodeURIComponent(passportId)}`, { method: 'DELETE' });
                onSuccess?.('Passport deleted');
              } catch (err: any) {
                onError?.(err.message || 'Failed to delete passport');
              }
            },
          },
          {
            id: `passport.attach-evidence.${passportId}`,
            label: 'Attach evidence',
            description: 'Attach evidence to the current passport',
            scope: 'passport',
            icon: 'evidence',
            keywords: ['attach', 'evidence', 'passport', 'link'],
            run: async ({ onSuccess, onError }) => {
              const evidenceTitle = promptInput('Enter evidence title', 'Security report');
              if (!evidenceTitle) {
                onError?.('Evidence title is required');
                return;
              }
              try {
                await apiJson(`/api/evidence`, { method: 'POST', body: JSON.stringify({
                  passportId,
                  title: evidenceTitle,
                  type: 'manual',
                  source: 'command-bar',
                }) });
                onSuccess?.('Evidence attached to passport');
              } catch (err: any) {
                onError?.(err.message || 'Failed to attach evidence');
              }
            },
          },
          {
            id: `passport.share.${passportId}`,
            label: 'Share passport',
            description: 'Open sharing options for this passport',
            scope: 'passport',
            icon: 'key',
            keywords: ['share', 'passport', 'link', 'public'],
            run: async ({ onSuccess, onError }) => {
              if (typeof window !== 'undefined') {
                const shareUrl = `${window.location.origin}/passport/${encodeURIComponent(passportId)}`;
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  onSuccess?.('Passport URL copied to clipboard');
                } catch (err: any) {
                  onError?.(err.message || 'Failed to copy share link');
                }
              }
            },
          },
          {
            id: `passport.view-disclosures.${passportId}`,
            label: 'View disclosures',
            description: 'Open the disclosure summary for this passport',
            scope: 'passport',
            icon: 'file',
            keywords: ['view', 'disclosures', 'passport', 'show'],
            run: async () => {
              if (typeof window !== 'undefined') {
                window.history.pushState({}, '', `/passport/${encodeURIComponent(passportId)}?tab=disclosures`);
                window.dispatchEvent(new Event('popstate'));
              }
            },
          },
        ];
      },
    });
  }

  return commands;
};

const createEvidenceCommandSet = (context: CommandContextState): Command[] => {
  const commands: Command[] = [
    {
      id: 'evidence.github-scan',
      label: 'Scan GitHub repository for evidence',
      description: 'Use GitHub metadata to create evidence signals',
      scope: 'evidence',
      icon: 'file',
      keywords: ['github', 'scan', 'evidence', 'repository', 'repo'],
      requiredContext: ['workspace'],
      run: async ({ workspaceId, onSuccess, onError }) => {
        const repo = promptInput('GitHub owner/repo', 'octocat/hello-world');
        if (!repo) {
          onError?.('GitHub repository is required');
          return;
        }
        const [owner, repoName] = repo.split('/').map((part) => part.trim());
        if (!owner || !repoName) {
          onError?.('Enter owner/repo like octocat/hello-world');
          return;
        }
        const softwareId = context.activePassportId || promptInput('Target software ID for evidence', '');
        if (!softwareId) {
          onError?.('Software ID is required');
          return;
        }
        try {
          const result = await apiJson('/api/spr/github/scan', {
            method: 'POST',
            body: JSON.stringify({
              workspaceId,
              owner,
              repo: repoName,
              softwareId,
            }),
          });
          if (result.ok) {
            onSuccess?.(`GitHub evidence created for ${owner}/${repoName}`);
          }
        } catch (err: any) {
          onError?.(err.message || 'Failed to scan GitHub repository');
        }
      },
    },
  ];

  if (context.activePassportId) {
    commands.push({
      id: 'evidence.link-to-passport',
      label: 'Link a new evidence item to active passport',
      description: 'Create evidence and attach it to the current passport',
      scope: 'evidence',
      icon: 'evidence',
      keywords: ['link', 'attach', 'evidence', 'passport'],
      requiredContext: ['passport'],
      steps: [
        {
          prompt: 'Enter evidence title',
          placeholder: 'Audit report',
          validate: (input: string) => input.length > 2,
          run: async (title, ctx) => {
            const type = promptInput('Evidence type', 'security-scan');
            if (!type) {
              throw new Error('Evidence type is required');
            }
            await apiJson(`/api/spr/evidence`, { method: 'POST', body: JSON.stringify({
              workspaceId: ctx.workspaceId,
              softwareId: ctx.activePassportId,
              title,
              type,
              source: 'manual',
              visibility: 'public',
            }) });
          },
        },
      ],
      run: async () => {
        // Step-driven command.
      },
    });
  }

  if (context.activeEvidenceId) {
    commands.push({
      id: 'evidence.menu',
      label: 'Evidence actions',
      description: 'Open evidence-specific sub-menu actions',
      scope: 'evidence',
      icon: 'evidence',
      keywords: ['evidence', 'actions', 'menu', 'verify', 'bundle', 'privacy', 'zkp'],
      requiredContext: ['evidence'],
      requiresEntity: 'evidence',
      subMenu: async (ctx) => {
        const evidenceId = ctx.activeEvidenceId!;
        return [
          {
            id: `evidence.open.${evidenceId}`,
            label: 'Open evidence',
            description: 'Navigate to the evidence detail page',
            scope: 'evidence',
            icon: 'file',
            keywords: ['open', 'view', 'evidence', 'details'],
            run: async () => {
              if (typeof window !== 'undefined') {
                window.history.pushState({}, '', `/evidence/${encodeURIComponent(evidenceId)}`);
                window.dispatchEvent(new Event('popstate'));
              }
            },
          },
          {
            id: `evidence.verify.${evidenceId}`,
            label: 'Verify evidence',
            description: 'Mark evidence as verified or pending',
            scope: 'evidence',
            icon: 'check',
            keywords: ['verify', 'evidence', 'validation', 'confirm'],
            steps: [
              {
                prompt: 'Enter verification status (verified OR pending)',
                placeholder: 'verified',
                validate: (input: string) => ['verified', 'pending'].includes(input.trim().toLowerCase()),
                run: async (status) => {
                  await apiJson(`/api/spr/evidence/${encodeURIComponent(evidenceId)}/verify`, { method: 'POST', body: JSON.stringify({
                    verified: status.trim().toLowerCase() === 'verified',
                    details: `Updated via command bar`,
                  }) });
                },
              },
            ],
            run: async () => {
              // step-driven command
            },
          },
          {
            id: `evidence.visibility.${evidenceId}`,
            label: 'Set evidence visibility',
            description: 'Change how this evidence is shared',
            scope: 'evidence',
            icon: 'key',
            keywords: ['visibility', 'privacy', 'restricted', 'public', 'evidence'],
            steps: [
              {
                prompt: 'Enter visibility (public OR restricted)',
                placeholder: 'public',
                validate: (input: string) => ['public', 'restricted'].includes(input.trim().toLowerCase()),
                run: async (visibility) => {
                  const selected = visibility.trim().toLowerCase();
                  const accessToken = selected === 'restricted'
                    ? promptInput('Enter restricted access token', '')
                    : '';
                  await apiJson(`/api/spr/evidence/${encodeURIComponent(evidenceId)}/privacy`, { method: 'POST', body: JSON.stringify({
                    visibility: selected,
                    accessToken: accessToken || null,
                  }) });
                },
              },
            ],
            run: async () => {
              // step-driven command
            },
          },
          {
            id: `evidence.bundle.${evidenceId}`,
            label: 'Create evidence bundle',
            description: 'Build a disclosure bundle for this evidence',
            scope: 'evidence',
            icon: 'file',
            keywords: ['bundle', 'evidence', 'disclosure', 'share'],
            steps: [
              {
                prompt: 'Enter recipients (comma-separated) or leave blank for public bundle',
                placeholder: 'alice@example.com,bob@example.com',
                run: async (recipients) => {
                  const recips = recipients
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean);
                  await apiJson(`/api/spr/evidence/${encodeURIComponent(evidenceId)}/bundle`, { method: 'POST', body: JSON.stringify({
                    workspaceId: ctx.workspaceId,
                    encrypted: false,
                    recipients: recips,
                    selectiveDisclosure: false,
                  }) });
                },
              },
            ],
            run: async () => {
              // step-driven command
            },
          },
          {
            id: `evidence.zkp.${evidenceId}`,
            label: 'Attach ZKP proof',
            description: 'Attach a zero-knowledge proof to this evidence',
            scope: 'evidence',
            icon: 'file',
            keywords: ['zkp', 'proof', 'evidence', 'privacy'],
            steps: [
              {
                prompt: 'Enter ZKP statement',
                placeholder: 'Proof statement',
                validate: (input: string) => input.length > 5,
                run: async (statement) => {
                  const proof = promptInput('Enter proof payload', 'proof-data');
                  if (!proof) throw new Error('Proof payload is required');
                  await apiJson(`/api/spr/evidence/${encodeURIComponent(evidenceId)}/zkp`, { method: 'POST', body: JSON.stringify({
                    statement,
                    proof,
                    verified: true,
                  }) });
                },
              },
            ],
            run: async () => {
              // step-driven command
            },
          },
          {
            id: `evidence.copy-id.${evidenceId}`,
            label: 'Copy evidence ID',
            description: 'Copy the current evidence identifier to clipboard',
            scope: 'evidence',
            icon: 'file',
            keywords: ['copy', 'evidence', 'id', 'clipboard'],
            run: async ({ onSuccess, onError }) => {
              try {
                if (navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(evidenceId);
                  onSuccess?.('Evidence ID copied');
                } else {
                  onError?.('Clipboard unavailable');
                }
              } catch (err: any) {
                onError?.(err.message || 'Failed to copy evidence ID');
              }
            },
          },
        ];
      },
    });
  }

  return commands;
};

const createGraphCommandSet = (context: CommandContextState): Command[] => {
  const commands: Command[] = [];

  if (context.activeGraphNodeId) {
    commands.push({
      id: 'graph.reveal-selected-node',
      label: 'Reveal selected graph node',
      description: 'Show the currently selected node in the lineage graph.',
      preview: async () => ({
        title: 'Selected graph node',
        description: `Ready to reveal node ${context.activeGraphNodeId}`,
        meta: {
          Node: context.activeGraphNodeId,
          Scope: 'Lineage graph',
        },
      }),
      scope: 'workspace',
      icon: 'search',
      keywords: ['graph', 'lineage', 'node', 'reveal', 'selected'],
      requiredContext: ['workspace'],
      run: async ({ activeGraphNodeId, onSuccess, onError }) => {
        if (!activeGraphNodeId) {
          onError?.('No graph node selected');
          return;
        }
        if (typeof window !== 'undefined') {
          const path = `/lineage?node=${encodeURIComponent(activeGraphNodeId)}`;
          window.history.pushState({}, '', path);
          window.dispatchEvent(new Event('popstate'));
          onSuccess?.(`Opened lineage graph for node ${activeGraphNodeId}`);
        } else {
          onSuccess?.(`Graph node available: ${activeGraphNodeId}`);
        }
      },
    });

    commands.push({
      id: 'graph.copy-node-id',
      label: 'Copy selected graph node ID',
      description: 'Copy the currently selected lineage graph node ID to clipboard.',
      preview: async () => ({
        title: 'Copy graph node ID',
        description: `This will copy node ${context.activeGraphNodeId} to your clipboard.`,
        meta: {
          Node: context.activeGraphNodeId,
          Action: 'Copy to clipboard',
        },
      }),
      scope: 'workspace',
      icon: 'file',
      keywords: ['copy', 'node', 'id', 'graph', 'lineage'],
      requiredContext: ['workspace'],
      run: async ({ activeGraphNodeId, onSuccess, onError }) => {
        if (!activeGraphNodeId) {
          onError?.('No graph node selected');
          return;
        }
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(activeGraphNodeId);
            onSuccess?.('Graph node id copied');
          } else {
            onError?.('Clipboard not available');
          }
        } catch (err: any) {
          onError?.(err.message || 'Failed to copy node id');
        }
      },
    });
  }

  return commands;
};

const createIntegrationCommandSet = (context: CommandContextState): Command[] => [
  {
    id: 'integration.github-connect',
    label: 'Connect GitHub integration',
    description: 'Connect GitHub for workspace trust signals',
    scope: 'integration',
    icon: 'key',
    keywords: ['github', 'connect', 'integration', 'oauth', 'auth'],
    requiredContext: ['workspace'],
    run: async ({ workspaceId, onSuccess, onError }) => {
      try {
        const result = await apiJson('/api/integrations/github', {
          method: 'POST',
          body: JSON.stringify({ workspaceId, action: 'connect' }),
        });
        if (result.ok) {
          onSuccess?.(`GitHub connected`);
        }
      } catch (err: any) {
        onError?.(err.message || 'Failed to connect GitHub');
      }
    },
  },
  {
    id: 'integration.rotate-key',
    label: 'Rotate integration API key',
    description: 'Generate a fresh workspace API key for integrations',
    scope: 'integration',
    icon: 'key',
    keywords: ['rotate', 'api', 'key', 'integration', 'token', 'secret'],
    requiredContext: ['workspace'],
    run: async ({ workspaceId, onSuccess, onError }) => {
      try {
        const result = await apiJson('/api/integrations/rotate-key', {
          method: 'POST',
          body: JSON.stringify({ workspaceId }),
        });
        if (result.ok) {
          onSuccess?.(`New API key generated`);
        }
      } catch (err: any) {
        onError?.(err.message || 'Failed to rotate key');
      }
    },
  },
];

const createWorkspaceCommandSet = (context: CommandContextState): Command[] => [
  {
    id: 'workspace.scan',
    label: 'Run workspace asset scan',
    description: 'Start an asset discovery scan for this workspace',
    scope: 'workspace',
    icon: 'search',
    keywords: ['scan', 'discover', 'assets', 'inventory', 'find'],
    requiredContext: ['workspace'],
    run: async ({ workspaceId, onSuccess, onError }) => {
      try {
        const result = await apiJson('/api/scans', {
          method: 'POST',
          body: JSON.stringify({ workspaceId, scanType: 'discovery' }),
        });
        if (result.ok) {
          onSuccess?.(`Scan started: ${result.scan?.id || result.scanId || 'pending'}`);
        }
      } catch (err: any) {
        onError?.(err.message || 'Failed to start scan');
      }
    },
  },
  {
    id: 'workspace.trust-score',
    label: 'View workspace trust score',
    description: 'Load the current workspace trust score summary',
    scope: 'workspace',
    icon: 'search',
    keywords: ['trust', 'score', 'workspace', 'summary', 'health'],
    requiredContext: ['workspace'],
    preview: async () => {
      if (!context.workspaceId) {
        return { title: 'Workspace trust score', description: 'No workspace selected.' };
      }
      const result = await apiJson(`/api/workspaces/${encodeURIComponent(context.workspaceId)}/trust-score`);
      return {
        title: 'Workspace trust score',
        description: `Current score is ${result.score ?? 'unknown'} (${result.band ?? 'unknown'})`,
        meta: {
          Score: result.score ?? 'unknown',
          Band: result.band ?? 'unknown',
          Updated: result.generatedAt ?? 'unknown',
        },
      };
    },
    run: async ({ workspaceId, onSuccess, onError }) => {
      try {
        const result = await apiJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/trust-score`);
        if (result.ok) {
          onSuccess?.(`Workspace trust score: ${result.score ?? 'unknown'}`);
        }
      } catch (err: any) {
        onError?.(err.message || 'Failed to load trust score');
      }
    },
  },
];

const createUserCommandSet = (context: CommandContextState): Command[] => [
  {
    id: 'user.invite',
    label: 'Invite user to workspace',
    description: 'Send a workspace invitation to a new team member',
    scope: 'user',
    icon: 'user',
    keywords: ['invite', 'user', 'member', 'add', 'team', 'email'],
    requiredContext: ['workspace'],
    steps: [
      {
        prompt: 'Enter user email',
        placeholder: 'user@example.com',
        validate: (input: string) => input.includes('@') && input.includes('.'),
        run: async (email, ctx) => {
          const role = promptInput('Role (Owner, Admin, Reviewer, Viewer)', 'Reviewer') || 'Reviewer';
          await apiJson(`/api/workspaces/${encodeURIComponent(ctx.workspaceId)}/members`, { method: 'POST', body: JSON.stringify({
            email,
            role,
          }) });
        },
      },
    ],
    run: async () => {
      // Step-driven command.
    },
  },
];

const createSystemCommandSet = (): Command[] => [
  {
    id: 'system.help',
    label: 'Show command bar help',
    description: 'Display keyboard shortcuts and command bar usage tips',
    scope: 'system',
    icon: 'search',
    keywords: ['help', 'info', 'guide', 'keyboard', 'shortcuts'],
    run: async ({ onSuccess }) => {
      onSuccess?.('Use Ctrl+K (Cmd+K) to open the bar, type to search, and Enter to execute.');
    },
  },
  {
    id: 'system.clear-cache',
    label: 'Clear local cache',
    description: 'Clear browser-local command bar state and workspace cache',
    scope: 'system',
    icon: 'rotate',
    keywords: ['clear', 'cache', 'refresh', 'reset'],
    run: async ({ onSuccess }) => {
      try {
        localStorage.removeItem('ventureos-cache');
        sessionStorage.clear();
        onSuccess?.('Local cache cleared');
      } catch (err: any) {
        onSuccess?.('Local cache cleared');
      }
    },
  },
];

export const useCommandRegistry = (context: CommandContextState = { workspaceId: '' }): Command[] => {
  return useMemo<Command[]>(() => {
    return [
      ...createPassportCommandSet(context),
      ...createEvidenceCommandSet(context),
      ...createGraphCommandSet(context),
      ...createIntegrationCommandSet(context),
      ...createWorkspaceCommandSet(context),
      ...createUserCommandSet(context),
      ...createSystemCommandSet(),
    ];
  }, [context]);
};






