import { isReadTool, resolveTool } from './schemas/intents.schemas';
import type { IntentItem } from './schemas/ai.schemas';

export type Layer2JobKind = 'execute-read-tools' | 'generate-response';

// Pure decision for what a deferred layer-2 job must do: if any intent in the
// message resolves to a read tool, those tools still need to run before the
// reply can be generated; otherwise only the reply is left.
export const decideLayer2JobKind = (intents: IntentItem[]): Layer2JobKind => {
  const hasReadIntents = intents.some((item) => {
    const toolName = resolveTool(item.intent, item.entities);
    return toolName ? isReadTool(toolName) : false;
  });
  return hasReadIntents ? 'execute-read-tools' : 'generate-response';
};
