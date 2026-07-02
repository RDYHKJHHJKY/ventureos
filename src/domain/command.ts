/**
 * Command domain types
 * Defines the structure for universal command bar commands
 */

export type CommandScope = 'workspace' | 'passport' | 'evidence' | 'file' | 'integration' | 'user' | 'system';
export type CommandIcon = 'passport' | 'evidence' | 'key' | 'file' | 'user' | 'plus' | 'rotate' | 'search' | 'alert' | 'check';

export type EntityType = 'passport' | 'evidence' | 'file' | 'key' | 'user' | 'integration' | 'graph-node' | 'workspace';

export interface EntityRoute {
  entityId: string;
  entityType: EntityType;
}

export interface CommandContextState {
  workspaceId: string;
  activeEntity?: EntityRoute;
  activePassportId?: string;
  activeEvidenceId?: string;
  activeFileId?: string;
  activeGraphNodeId?: string;
  activeIntegrationId?: string;
  activeUserId?: string;
  currentPage?: string;
  currentRoute?: string;
  refreshWorkspace?: () => void;
  workspaceRefreshKey?: number;
}

export interface CommandContext extends CommandContextState {
  onSuccess?: (message: string) => void;
  onError?: (error: string) => void;
}

export type CommandPreviewMeta = Record<string, string | number | boolean | null>;

export interface PreviewNavigation {
  label: string;
  navigate: (ctx: CommandContextState) => void;
}

export interface PreviewAction {
  label: string;
  run: (ctx: CommandContextState) => Promise<void>;
}

export interface PreviewField {
  label: string;
  value: string;
  editable?: boolean;
  onEdit?: (newValue: string, ctx: CommandContextState) => Promise<void>;
}

export interface CommandPreviewData {
  title: string;
  description?: string;
  meta?: CommandPreviewMeta;
  actions?: PreviewAction[];
  fields?: PreviewField[];
  navigation?: PreviewNavigation[];
}

export interface FlowState {
  [key: string]: any;
}

export interface CommandStep {
  prompt: string;
  placeholder?: string;
  validate?: (input: string) => boolean;
  run: (input: string, ctx: CommandContextState, state: FlowState) => Promise<void | Command[]>;
}

export type CommandPreviewResolver =
  | CommandPreviewData
  | string
  | ((ctx: CommandContextState) => Promise<CommandPreviewData | string | null>);

export interface Command {
  id: string;
  label: string;
  description?: string;
  preview?: CommandPreviewResolver;
  scope: CommandScope;
  icon?: CommandIcon;
  keywords: string[];
  requiresContext?: boolean; // legacy helper for active context commands
  requiredContext?: CommandScope[]; // precise context requirements
  requiresEntity?: EntityType | EntityType[];
  steps?: CommandStep[];
  state?: FlowState;
  chain?: (ctx: CommandContextState) => Promise<Command[]>;
  subMenu?: (ctx: CommandContextState) => Promise<Command[]> | Command[];
  disabled?: boolean;
  disabledReason?: string;
  run: (ctx: CommandContext) => Promise<void>;
}

export interface InteractionNode {
  id: string;
  type: EntityType;
  data: any;
  preview?: CommandPreviewResolver;
}

export interface InteractionEdge {
  id: string;
  from: string;
  to: string;
  commandId: string;
  metadata?: Record<string, any>;
}

export interface InteractionGraph {
  nodes: Map<string, InteractionNode>;
  edges: Map<string, InteractionEdge>;
}

export interface AutoCommandDefinition {
  entityType: EntityType;
  actions: (entity: any, ctx: CommandContextState) => Command[];
}

export interface AutoPreviewDefinition {
  entityType: EntityType;
  preview: (entity: any, ctx: CommandContextState) => CommandPreviewData;
}

export interface AutoMenuDefinition {
  entityType: EntityType;
  menu: (entity: any, ctx: CommandContextState) => Command[];
}

export interface AutoEdgeDefinition {
  entityType: EntityType;
  edges: (entity: any, graph: InteractionGraph, ctx: CommandContextState) => InteractionEdge[];
}

export interface AutoFlowDefinition {
  entityType: EntityType;
  flows: (entity: any, ctx: CommandContextState) => Command[];
}

export interface AutoNavigationDefinition {
  entityType: EntityType;
  navigation: (entity: any, ctx: CommandContextState) => PreviewNavigation[];
}

/**
 * Command groups for organizational purposes
 */
export interface CommandGroup {
  label: string;
  commands: Command[];
}

/**
 * Fuzzy search result
 */
export interface CommandSearchResult {
  command: Command;
  score: number; // 0-1, higher = better match
}
