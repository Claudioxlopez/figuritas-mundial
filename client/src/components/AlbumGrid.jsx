import { groupFlag } from '../../../album-catalog.js';

export default function AlbumGrid({
  groups,
  mode,
  pastedSet,
  availableMap,
  onToggle,
  onAdjustAvailable,
  savingId,
}) {
  return (
    <div className="album-grid">
      {groups.map((group) => {
        const pastedInGroup = group.stickers.filter((id) => pastedSet.has(id)).length;
        const availInGroup = group.stickers.reduce(
          (s, id) => s + (availableMap.get(id) || 0),
          0
        );

        return (
          <section key={group.id} className="album-card">
            <header className="album-card-header">
              <span className="album-card-flag" aria-hidden>
                {groupFlag(group)}
              </span>
              <div className="album-card-title">
                <h3>{group.name}</h3>
                <span className="album-card-meta">
                  {mode === 'pasted'
                    ? `${pastedInGroup}/${group.stickers.length} pegadas`
                    : `${availInGroup} para intercambiar · ${pastedInGroup} pegadas`}
                </span>
              </div>
            </header>
            <div className="album-chips">
              {group.stickers.map((stickerId) => {
                const isPasted = pastedSet.has(stickerId);
                const availQty = availableMap.get(stickerId) || 0;
                const isSaving = savingId === stickerId;

                let stateClass = '';
                if (mode === 'pasted') {
                  stateClass = isPasted ? 'chip-pasted' : '';
                } else if (availQty > 0) {
                  stateClass = isPasted ? 'chip-both' : 'chip-available';
                } else if (isPasted) {
                  stateClass = 'chip-pasted-dim';
                }

                if (mode === 'available') {
                  return (
                    <div key={stickerId} className={`chip-control ${isSaving ? 'chip-saving' : ''}`}>
                      <button
                        type="button"
                        className={`album-chip ${stateClass}`}
                        onClick={() => onAdjustAvailable(stickerId, 1)}
                        disabled={Boolean(savingId)}
                        title={`${stickerId}: tocar para sumar`}
                      >
                        {stickerId}
                        {availQty > 0 && <span className="chip-qty">×{availQty}</span>}
                      </button>
                      <button
                        type="button"
                        className="chip-btn chip-btn-menos"
                        onClick={() => onAdjustAvailable(stickerId, -1)}
                        disabled={Boolean(savingId) || availQty <= 0}
                        aria-label={`Restar disponible de ${stickerId}`}
                        title="Restar"
                      >
                        -
                      </button>
                    </div>
                  );
                }

                return (
                  <button
                    key={stickerId}
                    type="button"
                    className={`album-chip ${stateClass} ${isSaving ? 'chip-saving' : ''}`}
                    onClick={() => onToggle(stickerId)}
                    disabled={Boolean(savingId)}
                    title={stickerId}
                  >
                    {stickerId}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
