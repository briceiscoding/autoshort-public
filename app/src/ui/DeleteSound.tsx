import React, { useState } from "react";
import { api } from "./api";
import { Icon } from "./icons";
import { stopSfx } from "./listen";

// Delete a sound of library/sfx in two clicks (it goes to the recycle bin). A sound still used by a moment or a video is
// refused by the server, with where it is used.
export const DeleteSound: React.FC<{
  file: string;
  onDone: () => void;
  onError: (message: string) => void;
}> = ({ file, onDone, onError }) => {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!asking)
    return (
      <button
        className="icon-btn"
        title="Delete this sound"
        aria-label="Delete"
        onClick={() => setAsking(true)}
      >
        <Icon name="trash" size={14} />
      </button>
    );
  return (
    <span className="row">
      <button
        className="small danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          stopSfx();
          try {
            await api.deleteSfx(file);
            onDone();
          } catch (e) {
            onError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      <button className="small" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  );
};
