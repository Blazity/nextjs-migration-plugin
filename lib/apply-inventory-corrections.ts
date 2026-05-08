import { DraftInventorySchema, type DraftInventory, type DraftInventoryEntry } from "../schemas/draft-inventory.ts";
import { InventoryCorrectionSchema, type InventoryCorrection } from "../schemas/inventory-correction.ts";

export function applyCorrections(
  draftInventory: DraftInventory,
  corrections: InventoryCorrection[],
): DraftInventory {
  const parsedDraft = DraftInventorySchema.parse(draftInventory);
  const parsedCorrections = corrections.map(correction => InventoryCorrectionSchema.parse(correction));
  if (parsedCorrections.length === 0) {
    return parsedDraft;
  }

  const entries = parsedDraft.entries.map(entry => ({ ...entry, sectionInstanceIds: [...entry.sectionInstanceIds] }));

  for (const correction of parsedCorrections) {
    applyCorrection(entries, correction);
  }

  return DraftInventorySchema.parse({
    ...parsedDraft,
    revision: parsedDraft.revision + 1,
    entries,
  });
}

function applyCorrection(entries: DraftInventoryEntry[], correction: InventoryCorrection): void {
  switch (correction.type) {
    case "rename": {
      findEntry(entries, correction.componentGroupId).proposedName = correction.newName;
      return;
    }
    case "merge": {
      if (correction.sourceGroupIds.includes(correction.targetGroupId)) {
        throw new Error(`Cannot merge a group into itself: ${correction.targetGroupId}`);
      }
      const target = findEntry(entries, correction.targetGroupId);
      for (const sourceGroupId of correction.sourceGroupIds) {
        const sourceIndex = findEntryIndex(entries, sourceGroupId);
        const [source] = entries.splice(sourceIndex, 1);
        target.sectionInstanceIds.push(...source.sectionInstanceIds);
      }
      return;
    }
    case "split": {
      const source = findEntry(entries, correction.sourceGroupId);
      const selected = new Set(correction.sectionInstanceIds);
      const remaining = source.sectionInstanceIds.filter(id => !selected.has(id));
      const moved = source.sectionInstanceIds.filter(id => selected.has(id));
      if (moved.length !== correction.sectionInstanceIds.length) {
        throw new Error(`Cannot split missing section instances from ${correction.sourceGroupId}`);
      }
      if (remaining.length === 0) {
        throw new Error(`Cannot split all section instances from ${correction.sourceGroupId}`);
      }
      source.sectionInstanceIds = remaining;
      const sourceIndex = findEntryIndex(entries, correction.sourceGroupId);
      entries.splice(sourceIndex + 1, 0, {
        componentGroupId: nextSplitGroupId(entries, correction.sourceGroupId),
        proposedName: correction.newGroupName,
        kind: correction.newKind ?? source.kind,
        sectionInstanceIds: moved,
      });
      return;
    }
    case "set-kind": {
      findEntry(entries, correction.componentGroupId).kind = correction.kind;
      return;
    }
    case "note": {
      findEntry(entries, correction.componentGroupId).notes = correction.note;
      return;
    }
  }
}

function findEntry(entries: DraftInventoryEntry[], componentGroupId: string): DraftInventoryEntry {
  return entries[findEntryIndex(entries, componentGroupId)];
}

function findEntryIndex(entries: DraftInventoryEntry[], componentGroupId: string): number {
  const index = entries.findIndex(entry => entry.componentGroupId === componentGroupId);
  if (index < 0) {
    throw new Error(`Unknown component group: ${componentGroupId}`);
  }
  return index;
}

function nextSplitGroupId(entries: DraftInventoryEntry[], sourceGroupId: string): string {
  let index = 1;
  const existing = new Set(entries.map(entry => entry.componentGroupId));
  while (existing.has(`${sourceGroupId}-split-${index}`)) {
    index++;
  }
  return `${sourceGroupId}-split-${index}`;
}
