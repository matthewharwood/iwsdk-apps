import type { DamageEffectInstance, PendingDamageFrame, RulesState } from "@iwsdk-apps/contracts";
import {
  createView,
  type FieldSchema,
  prepareSelector,
  resolve,
  type Selector,
} from "@iwsdk-apps/rule-selection";

const fields = {
  instanceUsed: "boolean",
  amount: "integer",
  sourceIsSpell: "boolean",
  sourceRequirement: "string",
  recipientKind: "string",
  recipientPlayer: "string",
  providerController: "string",
  recipientRequirement: "string",
  preventable: "boolean",
} satisfies FieldSchema;
const selector: Selector = {
  op: "and",
  terms: [
    { op: "boolean-eq", field: "instanceUsed", value: false },
    { op: "integer-compare", field: "amount", comparison: "gt", value: 0 },
    {
      op: "or",
      terms: [
        { op: "string-eq", field: "sourceRequirement", value: "any" },
        { op: "boolean-eq", field: "sourceIsSpell", value: true },
      ],
    },
    {
      op: "or",
      terms: [
        { op: "string-eq", field: "recipientRequirement", value: "permanent-or-player" },
        {
          op: "and",
          terms: [
            { op: "string-eq", field: "recipientKind", value: "player" },
            { op: "string-eq", field: "providerController", value: { binding: "recipientPlayer" } },
          ],
        },
      ],
    },
  ],
};
const plan = prepareSelector(selector, fields, {
  prefilterFields: ["instanceUsed", "sourceRequirement", "recipientRequirement"],
  indexedFields: [
    "instanceUsed",
    "amount",
    "sourceIsSpell",
    "sourceRequirement",
    "recipientKind",
    "providerController",
    "recipientRequirement",
  ],
});
/** Event-version scope is rebuilt after every rewrite. Unpreventable does not exclude prevention. */
export function selectDamageEffects(
  state: RulesState,
  occurrence: PendingDamageFrame["occurrences"][number],
  eventVersion: number,
  instances: DamageEffectInstance[],
): DamageEffectInstance[] {
  const recipient = occurrence.original.recipient;
  const recipientPlayer = recipient.kind === "player" ? recipient.id : "";
  const view = createView(
    "rule-instance",
    {
      match: state.manifest.id,
      revision: state.revision,
      epoch: state.epoch,
      lens: "proposed",
      eventVersion: `${occurrence.original.id}:version:${eventVersion}`,
      processorVersion: "damage-event-selection/1",
      bindingsKey: JSON.stringify({ recipientPlayer }),
      universe: `damage-instance:${occurrence.original.id}`,
      generation: state.epoch,
    },
    fields,
    instances.map((instance) => ({
      id: instance.id,
      values: {
        instanceUsed: occurrence.applied.includes(instance.id),
        amount: occurrence.amount,
        sourceIsSpell: occurrence.original.source.isSpell,
        sourceRequirement: instance.program.source,
        recipientKind: recipient.kind,
        recipientPlayer,
        providerController: instance.provider.controller,
        recipientRequirement: instance.program.recipient,
        preventable: occurrence.original.source.preventable,
      },
    })),
    { recipientPlayer },
  );
  const result =
    state.manifest.resolver === "full-scan"
      ? resolve(view, selector)
      : resolve(view, selector, { mode: state.manifest.resolver, plan });
  const selected = new Set(result.ids);
  return instances.filter((instance) => selected.has(instance.id));
}
