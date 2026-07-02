import { apiJson } from '../api-client';
import {
  Command,
  CommandContextState,
  CommandPreviewData,
  PreviewNavigation,
  InteractionGraph,
  InteractionNode,
  InteractionEdge,
  AutoCommandDefinition,
  AutoPreviewDefinition,
  AutoMenuDefinition,
  AutoEdgeDefinition,
  AutoFlowDefinition,
  AutoNavigationDefinition,
} from '../domain/command';

const formatPassportPreview = (passport: any) => ({
  title: passport.name || passport.softwareId || passport.id,
  description: passport.summary || passport.status || 'Passport details',
  meta: {
    Status: passport.status || passport.verdict || 'unknown',
    Trust: passport.trust ?? 'unknown',
    Issued: passport.issuedAt || passport.createdAt || 'unknown',
    Expires: passport.expiresAt || passport.expires || 'unknown',
  },
});

const createPassportNode = (passport: any): InteractionNode => ({
  id: passport.id,
  type: 'passport',
  data: passport,
  preview: async () => formatPassportPreview(passport),
});

const createWorkspaceNode = (workspaceId: string): InteractionNode => ({
  id: `workspace:${workspaceId}`,
  type: 'workspace',
  data: { id: workspaceId },
  preview: async () => ({
    title: `Workspace ${workspaceId}`,
    description: 'Workspace root for command graph actions.',
    meta: {
      Workspace: workspaceId,
    },
  }),
});

const createEvidenceNode = (evidence: any): InteractionNode => ({
  id: evidence.id,
  type: 'evidence',
  data: evidence,
  preview: async () => ({
    title: evidence.title || evidence.id,
    description: evidence.summary || evidence.type || 'Evidence details',
    meta: {
      Type: evidence.type || 'unknown',
      Verified: evidence.verificationStatus === 'verified' || evidence.verified ? 'yes' : 'no',
      Visibility: evidence.visibility || 'public',
      Source: evidence.source || 'unknown',
    },
  }),
});

const passportAutoCommands: AutoCommandDefinition = {
  entityType: 'passport',
  actions: (passport: any, ctx: CommandContextState) => [
    {
      id: `passport.open.${passport.id}`,
      label: `Open passport: ${passport.name || passport.id}`,
      description: 'Navigate to this passport',
      scope: 'passport',
      icon: 'passport',
      keywords: ['open', 'passport', 'navigate'],
      requiredContext: ['workspace'],
      preview: async () => formatPassportPreview(passport),
      run: async () => {
        if (typeof window === 'undefined') return;
        window.history.pushState({}, '', `/passport/${encodeURIComponent(passport.id)}`);
        window.dispatchEvent(new Event('popstate'));
      },
    },
    {
      id: `passport.rename.${passport.id}`,
      label: 'Rename passport',
      description: 'Rename the selected passport',
      scope: 'passport',
      icon: 'rotate',
      keywords: ['rename', 'passport', 'edit'],
      requiredContext: ['workspace'],
      steps: [
        {
          prompt: 'Enter new name',
          placeholder: passport.name || 'Passport name',
          validate: (input: string) => input.length > 2,
          run: async (name) => {
            await apiJson('PATCH', `/api/passports/${encodeURIComponent(passport.id)}`, { name });
          },
        },
      ],
      run: async () => {},
    },
    {
      id: `passport.delete.${passport.id}`,
      label: 'Delete passport',
      description: 'Delete this passport',
      scope: 'passport',
      icon: 'alert',
      keywords: ['delete', 'passport', 'remove'],
      requiredContext: ['workspace'],
      run: async ({ onSuccess, onError }) => {
        try {
          await apiJson('DELETE', `/api/passports/${encodeURIComponent(passport.id)}`);
          onSuccess?.('Passport deleted');
        } catch (err: any) {
          onError?.(err.message || 'Failed to delete passport');
        }
      },
    },
  ],
};

const evidenceAutoCommands: AutoCommandDefinition = {
  entityType: 'evidence',
  actions: (evidence: any) => [
    {
      id: `evidence.open.${evidence.id}`,
      label: `Open evidence: ${evidence.title || evidence.id}`,
      description: 'Navigate to the evidence detail view',
      scope: 'evidence',
      icon: 'file',
      keywords: ['open', 'evidence', 'view'],
      requiredContext: ['workspace'],
      preview: async () => ({
        title: evidence.title || evidence.id,
        description: evidence.summary || evidence.type || 'Evidence details',
        meta: {
          Type: evidence.type || 'unknown',
          Visibility: evidence.visibility || 'public',
        },
      }),
      run: async () => {
        if (typeof window === 'undefined') return;
        window.history.pushState({}, '', `/evidence/${encodeURIComponent(evidence.id)}`);
        window.dispatchEvent(new Event('popstate'));
      },
    },
    {
      id: `evidence.verify.${evidence.id}`,
      label: 'Verify evidence',
      description: 'Mark this evidence item as verified',
      scope: 'evidence',
      icon: 'check',
      keywords: ['verify', 'evidence', 'validated'],
      requiredContext: ['workspace'],
      steps: [
        {
          prompt: 'Enter verification state (verified/pending)',
          placeholder: 'verified',
          validate: (input: string) => ['verified', 'pending'].includes(input.trim().toLowerCase()),
          run: async (status) => {
            await apiJson('POST', `/api/spr/evidence/${encodeURIComponent(evidence.id)}/verify`, {
              verified: status.trim().toLowerCase() === 'verified',
              details: 'Updated via auto-generated command',
            });
          },
        },
      ],
      run: async () => {},
    },
  ],
};

const evidenceAutoPreview: AutoPreviewDefinition = {
  entityType: 'evidence',
  preview: (evidence: any) => ({
    title: evidence.title || evidence.id,
    description: evidence.description || evidence.summary || evidence.type || 'Evidence details',
    meta: {
      Type: evidence.type || 'unknown',
      Tier: evidence.privacyTier || evidence.visibility || 'unknown',
      Size: evidence.size || 'unknown',
      Updated: evidence.updatedAt || evidence.modifiedAt || 'unknown',
    },
  }),
};

const evidenceAutoMenu: AutoMenuDefinition = {
  entityType: 'evidence',
  menu: (evidence: any) => [
    {
      id: `evidence.open.${evidence.id}`,
      label: 'Open evidence',
      description: 'View the evidence item',
      scope: 'evidence',
      icon: 'file',
      keywords: ['open', 'view', 'evidence'],
      run: async () => {
        if (typeof window === 'undefined') return;
        window.history.pushState({}, '', `/evidence/${encodeURIComponent(evidence.id)}`);
        window.dispatchEvent(new Event('popstate'));
      },
    },
    {
      id: `evidence.move.${evidence.id}`,
      label: 'Move evidence',
      description: 'Move this evidence item to another software object',
      scope: 'evidence',
      icon: 'file',
      keywords: ['move', 'evidence', 'relocate'],
      steps: [
        {
          prompt: 'Enter destination software ID',
          placeholder: 'software-123',
          validate: (input: string) => input.length > 2,
          run: async (softwareId) => {
            await apiJson('PATCH', `/api/spr/evidence/${encodeURIComponent(evidence.id)}`, {
              softwareId,
            });
          },
        },
      ],
      run: async () => {},
    },
    {
      id: `evidence.delete.${evidence.id}`,
      label: 'Delete evidence',
      description: 'Remove this evidence item from the workspace',
      scope: 'evidence',
      icon: 'alert',
      keywords: ['delete', 'remove', 'evidence'],
      run: async ({ onSuccess, onError }) => {
        try {
          await apiJson('DELETE', `/api/spr/evidence/${encodeURIComponent(evidence.id)}`);
          onSuccess?.('Evidence deleted');
        } catch (err: any) {
          onError?.(err.message || 'Failed to delete evidence');
        }
      },
    },
  ],
};

const passportAutoEdges: AutoEdgeDefinition = {
  entityType: 'passport',
  edges: (passport: any, graph: InteractionGraph) => {
    const edges: InteractionEdge[] = [];
    const relatedEvidence = passport.evidenceIds || (Array.isArray(passport.evidence) ? passport.evidence.map((item: any) => item?.id || item) : []) || [];
    for (const eid of relatedEvidence) {
      edges.push({
        id: `passport.${passport.id}.evidence.${eid}`,
        from: passport.id,
        to: String(eid),
        commandId: `evidence.open.${eid}`,
        metadata: {
          label: `Open evidence ${eid}`,
          description: `Evidence referenced by passport ${passport.name || passport.id}`,
          type: 'passport-evidence',
        },
      });
    }
    return edges;
  },
};

const evidenceAutoFlows: AutoFlowDefinition = {
  entityType: 'evidence',
  flows: (evidence: any, ctx: CommandContextState) => [
    {
      id: `evidence.attach.${evidence.id}`,
      label: `Attach evidence ${evidence.id}`,
      description: 'Attach or update evidence workflows for this item',
      scope: 'evidence',
      icon: 'file',
      keywords: ['attach', 'evidence', 'workflow'],
      steps: [
        {
          prompt: 'Select attachment target',
          placeholder: 'passport-id or software-id',
          validate: (input: string) => input.length > 2,
          run: async (targetId, context, state) => {
            state.targetId = targetId;
          },
        },
        {
          prompt: 'Enter privacy tier',
          placeholder: 'public',
          run: async (tier, context, state) => {
            await apiJson('POST', `/api/spr/evidence/${encodeURIComponent(evidence.id)}/bundle`, {
              softwareId: state.targetId,
              tier,
            });
          },
        },
      ],
      run: async () => {},
    },
  ],
};

const graphNodeAutoNavigation: AutoNavigationDefinition = {
  entityType: 'graph-node',
  navigation: (node: any) => [
    {
      label: 'Open node',
      navigate: () => {
        if (typeof window === 'undefined') return;
        window.history.pushState({}, '', `/graph/node/${encodeURIComponent(node.id)}`);
        window.dispatchEvent(new Event('popstate'));
      },
    },
    {
      label: 'View neighbors',
      navigate: () => {
        if (typeof window === 'undefined') return;
        window.history.pushState({}, '', `/graph/neighbors/${encodeURIComponent(node.id)}`);
        window.dispatchEvent(new Event('popstate'));
      },
    },
  ],
};

const autoCommandDefinitions: AutoCommandDefinition[] = [passportAutoCommands, evidenceAutoCommands];
const autoPreviewDefinitions: AutoPreviewDefinition[] = [evidenceAutoPreview];
const autoMenuDefinitions: AutoMenuDefinition[] = [evidenceAutoMenu];
const autoEdgeDefinitions: AutoEdgeDefinition[] = [passportAutoEdges];
const autoFlowDefinitions: AutoFlowDefinition[] = [evidenceAutoFlows];
const autoNavigationDefinitions: AutoNavigationDefinition[] = [graphNodeAutoNavigation];

const generateAutoCommands = (entity: InteractionNode, ctx: CommandContextState): Command[] => {
  return autoCommandDefinitions
    .filter((def) => def.entityType === entity.type)
    .flatMap((def) => def.actions(entity.data, ctx));
};

const generateAutoPreview = async (entity: InteractionNode, ctx: CommandContextState): Promise<CommandPreviewData | string | null> => {
  const previewDef = autoPreviewDefinitions.find((def) => def.entityType === entity.type);
  if (!previewDef) return null;
  return previewDef.preview(entity.data, ctx);
};

const generateAutoMenu = (entity: InteractionNode, ctx: CommandContextState): Command[] => {
  return autoMenuDefinitions
    .filter((def) => def.entityType === entity.type)
    .flatMap((def) => def.menu(entity.data, ctx));
};

const generateAutoEdges = (entity: InteractionNode, graph: InteractionGraph, ctx: CommandContextState): InteractionEdge[] => {
  return autoEdgeDefinitions
    .filter((def) => def.entityType === entity.type)
    .flatMap((def) => def.edges(entity.data, graph, ctx));
};

const generateAutoFlows = (entity: InteractionNode, ctx: CommandContextState): Command[] => {
  return autoFlowDefinitions
    .filter((def) => def.entityType === entity.type)
    .flatMap((def) => def.flows(entity.data, ctx));
};

const generateAutoNavigation = (entity: InteractionNode, ctx: CommandContextState): PreviewNavigation[] => {
  return autoNavigationDefinitions
    .filter((def) => def.entityType === entity.type)
    .flatMap((def) => def.navigation(entity.data, ctx));
};

export const hydrateInteractionGraph = async (context: CommandContextState): Promise<InteractionGraph> => {
  const graph: InteractionGraph = {
    nodes: new Map(),
    edges: new Map(),
  };

  if (!context.workspaceId) {
    return graph;
  }

  const workspaceNode = createWorkspaceNode(context.workspaceId);
  graph.nodes.set(workspaceNode.id, workspaceNode);

  try {
      const [passportResponse, softwareResponse] = await Promise.all([
        apiJson('GET', `/api/passports?workspace=${encodeURIComponent(context.workspaceId)}`),
        apiJson('GET', `/api/spr/software`),
      ]);
      const passports = Array.isArray(passportResponse.passports) ? passportResponse.passports : [];
      const softwareItems = Array.isArray(softwareResponse.software) ? softwareResponse.software : [];

      passports.forEach((passport: any) => {
        graph.nodes.set(passport.id, createPassportNode(passport));
        graph.edges.set(`workspace.passport.open.${passport.id}`, {
          id: `workspace.passport.open.${passport.id}`,
          from: workspaceNode.id,
          to: passport.id,
          commandId: 'passport.open',
          metadata: {
            label: `Open passport ${passport.name || passport.id}`,
            description: passport.summary || passport.status || 'Navigate to this passport',
            type: 'passport-open',
          },
        });
      });

      softwareItems.forEach((softwareItem: any) => {
        const evidenceItems = Array.isArray(softwareItem.evidence) ? softwareItem.evidence : [];
        evidenceItems.forEach((evidence: any) => {
          if (!evidence?.id) return;
          graph.nodes.set(evidence.id, createEvidenceNode(evidence));
          if (String(evidence.workspaceId) === String(context.workspaceId)) {
            graph.edges.set(`workspace.evidence.open.${evidence.id}`, {
              id: `workspace.evidence.open.${evidence.id}`,
              from: workspaceNode.id,
              to: evidence.id,
              commandId: 'evidence.open',
              metadata: {
                label: `Open evidence ${evidence.title || evidence.id}`,
                description: evidence.summary || evidence.type || 'Inspect this evidence item',
                type: 'evidence-open',
              },
            });
          }

          const matchingPassport = passports.find((passport: any) => passport.softwareId === softwareItem.id || passport.id === softwareItem.id);
          if (matchingPassport) {
            graph.edges.set(`passport.evidence.open.${matchingPassport.id}.${evidence.id}`, {
              id: `passport.evidence.open.${matchingPassport.id}.${evidence.id}`,
              from: matchingPassport.id,
              to: evidence.id,
              commandId: 'evidence.open',
              metadata: {
                label: `Open evidence ${evidence.title || evidence.id}`,
                description: `Evidence attached to passport ${matchingPassport.name || matchingPassport.id}`,
                type: 'passport-evidence-open',
              },
            });
          }
        });
      });

      graph.nodes.forEach((node) => {
        const nodeEdges = generateAutoEdges(node, graph, context);
        nodeEdges.forEach((edge) => {
          graph.edges.set(edge.id, edge);
        });
      });
    } catch (error) {
      console.warn('Failed to hydrate graph nodes:', error);
    }

  return graph;
};

export const buildGraphCommands = (graph: InteractionGraph, context: CommandContextState): Command[] => {
  const commands: Command[] = [];

  graph.nodes.forEach((node) => {
    const autoCommands = generateAutoCommands(node, context);
    const autoMenus = generateAutoMenu(node, context);
    const autoFlows = generateAutoFlows(node, context);

    commands.push(...autoCommands);
    commands.push(...autoFlows);

    if (autoMenus.length > 0) {
      commands.push({
        id: `${node.type}.menu.${node.id}`,
        label: `${node.type.charAt(0).toUpperCase() + node.type.slice(1)} actions`,
        description: `Actions available for ${node.type} ${node.id}`,
        scope: node.type as any,
        icon: node.type === 'passport' ? 'passport' : node.type === 'evidence' ? 'file' : 'search',
        keywords: [node.type, 'actions', 'menu'],
        requiredContext: ['workspace'],
        subMenu: async () => autoMenus,
        run: async () => {},
      });
    }
  });

  graph.edges.forEach((edge) => {
    const target = graph.nodes.get(edge.to);
    if (!target) return;
    const label = edge.metadata?.label || `Open ${target.type}`;
    const description = edge.metadata?.description || `Navigate to ${target.type} entity`;
    const scope = target.type === 'passport' ? 'passport' : target.type === 'evidence' ? 'evidence' : 'workspace';

    commands.push({
      id: edge.id,
      label,
      description,
      scope,
      icon: target.type === 'passport' ? 'passport' : target.type === 'evidence' ? 'file' : 'search',
      keywords: [target.type, 'open', 'navigate', target.type === 'passport' ? 'passport' : target.type === 'evidence' ? 'evidence' : 'workspace'],
      requiredContext: ['workspace'],
      preview: async () => {
        if (target.preview) {
          const nodePreview = await target.preview(context);
          const navigation = generateAutoNavigation(target, context);
          if (typeof nodePreview === 'object' && nodePreview !== null) {
            return {
              ...nodePreview,
              navigation: [...(nodePreview.navigation || []), ...navigation],
            };
          }
          return nodePreview;
        }
        return {
          title: target.data.name || target.id,
          description: target.data.summary || '',
          navigation: generateAutoNavigation(target, context),
        };
      },
      run: async () => {
        if (typeof window === 'undefined') return;
        if (target.type === 'passport') {
          window.history.pushState({}, '', `/passport/${encodeURIComponent(target.id)}`);
          window.dispatchEvent(new Event('popstate'));
          return;
        }
        if (target.type === 'evidence') {
          window.history.pushState({}, '', `/evidence/${encodeURIComponent(target.id)}`);
          window.dispatchEvent(new Event('popstate'));
          return;
        }
      },
    });
  });

  return commands;
};
