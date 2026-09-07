import type { AttachedModifier, ExecutionRegistry, RulesState } from "@iwsdk-apps/contracts";
import {
  createView,
  type FieldSchema,
  prepareSelector,
  resolve,
  type Selector,
} from "@iwsdk-apps/rule-selection";

const fields = {
  target: "string",
  sourceZone: "string",
  targetZone: "string",
} satisfies FieldSchema;
const query: Selector = {
  op: "and",
  terms: [
    { op: "string-eq", field: "target", value: { binding: "target" } },
    { op: "string-eq", field: "sourceZone", value: "battlefield" },
    { op: "string-eq", field: "targetZone", value: "battlefield" },
  ],
};
const plan = prepareSelector(query, fields, {
  indexedFields: ["target", "sourceZone", "targetZone"],
  prefilterFields: ["target"],
});
/** Extant relationships, independent of targeting or subsequent attachment SBAs. */
export function attachmentModifiers(
  state: RulesState,
  registry: ExecutionRegistry,
  target: string,
): AttachedModifier[] {
  const links = Object.values(state.attachments ?? {}).sort((a, b) =>
    a.source < b.source ? -1 : a.source > b.source ? 1 : 0,
  );
  if (!links.length) return [];
  const view = createView(
    "object",
    {
      match: state.manifest.id,
      revision: state.revision,
      epoch: state.epoch,
      lens: "characteristic-prefix",
      eventVersion: String(state.eventSequence),
      processorVersion: "attachment-prefix/1",
      bindingsKey: target,
      universe: "live-attachment-relations",
      generation: state.epoch,
    },
    fields,
    links.map((link) => ({
      id: link.source,
      values: {
        target: link.target,
        sourceZone: state.objects[link.source]?.zone ?? "missing",
        targetZone: state.objects[link.target]?.zone ?? "missing",
      },
    })),
    { target },
  );
  const selected =
    state.manifest.resolver === "full-scan"
      ? resolve(view, query)
      : resolve(view, query, { mode: state.manifest.resolver, plan });
  return selected.ids.map((id) => {
    const source = state.objects[id];
    const program =
      source && !source.token
        ? registry.definitions[source.definition]?.attachmentProgram
        : undefined;
    if (!program) throw new Error("Attachment source program unavailable");
    return program.attachedModifier;
  });
}
