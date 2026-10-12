// Stable DOM while polling: sliders and keyboard focus are not replaced during playback.
export function createMusicControls(root, actions) {
  const dialog = document.createElement("section");
  dialog.className = "music-dialog";
  dialog.hidden = true;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "music-title");
  dialog.innerHTML = `
    <div class="section-heading"><div><p class="eyebrow">SPOTIFY CONNECT</p><h2 id="music-title">La musique à la maison</h2></div><button type="button" data-action="close">Fermer</button></div>
    <div class="music-now"><img class="music-art" alt="Pochette de l’album" hidden><div><h3 class="music-track">Aucune lecture</h3><p class="music-artist"></p><p class="music-device"></p></div></div>
    <label for="music-seek">Position dans le titre</label>
    <input id="music-seek" type="range" min="0" max="1" value="0" step="1000" disabled>
    <div class="music-times"><span class="music-position">0:00</span><span class="music-duration">0:00</span></div>
    <div class="music-transport"><button type="button" data-action="previous">Précédent</button><button type="button" data-action="toggle" class="music-play">Lecture</button><button type="button" data-action="next">Suivant</button></div>
    <div class="music-modes"><button type="button" data-action="shuffle" aria-pressed="false">Aléatoire</button><button type="button" data-action="repeat">Répétition : non</button></div>
    <div class="music-bottom"><div><label for="music-volume">Volume <span class="music-volume-value"></span></label><input id="music-volume" type="range" min="0" max="100" step="1" value="50"><p class="music-volume-note"></p></div>
    <div><label for="music-device-select">Écouter sur</label><select id="music-device-select"><option value="">Chargement des appareils…</option></select><div class="music-device-actions"><button type="button" data-action="transfer" disabled>Utiliser cet appareil</button><button type="button" data-action="devices">Actualiser</button></div><p class="music-device-note"></p></div></div>
    <p class="music-feedback" role="status"></p>`;
  document.body.appendChild(dialog);
  const q = (s) => dialog.querySelector(s);
  let current = {}, returnFocus = null, deviceSignature = "";
  const transferBlocked = () => !q("select").value || current.busy || current.unavailable || current.restricted || current.status === "signed-out" || Boolean(current.disallows?.transferring_playback);
  const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  function close() {
    dialog.hidden = true;
    document.getElementById("panel").inert = false;
    returnFocus?.focus();
  }
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("button,input,select")].filter(el => !el.disabled && !el.hidden);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  for (const button of dialog.querySelectorAll("[data-action]")) button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "close") close();
    else if (action === "toggle") current.isPlaying ? actions.pause() : actions.play();
    else if (action === "transfer") actions.transfer(q("select").value);
    else actions[action]();
  });
  q("#music-seek").addEventListener("input", e => { q(".music-position").textContent = clock(Number(e.target.value)); });
  q("#music-seek").addEventListener("change", e => actions.seek(Number(e.target.value)));
  q("#music-volume").addEventListener("input", e => { q(".music-volume-value").textContent = `${e.target.value}%`; });
  q("#music-volume").addEventListener("change", e => actions.setVolume(Number(e.target.value)));
  q("select").addEventListener("change", () => { q('[data-action="transfer"]').disabled = transferBlocked(); });

  return {
    open() {
      returnFocus = document.activeElement;
      dialog.hidden = false;
      document.getElementById("panel").inert = true;
      q('[data-action="close"]').focus();
      actions.devices();
    },
    update(state) {
      current = state;
      const playing = state.status === "playing";
      const blocked = state.busy || state.unavailable || state.restricted || !playing;
      const disallows = state.disallows || {};
      q(".music-track").textContent = playing ? state.track.name : state.status === "signed-out" ? "Session Spotify expirée" : "Spotify connecté";
      q(".music-artist").textContent = playing ? state.track.artists : "Lancez une musique depuis Spotify pour commencer.";
      q(".music-device").textContent = state.deviceName || "Aucun appareil actif";
      const image = q("img");
      if (playing && /^https:\/\//.test(state.artwork || "")) {
        if (image.getAttribute("src") !== state.artwork) image.src = state.artwork;
        image.hidden = false;
      } else { image.hidden = true; image.removeAttribute("src"); }
      for (const [action, restriction] of [["previous","skipping_prev"],["next","skipping_next"],["toggle",state.isPlaying ? "pausing" : "resuming"],["shuffle","toggling_shuffle"]]) {
        q(`[data-action="${action}"]`).disabled = Boolean(blocked || disallows[restriction]);
      }
      q('[data-action="toggle"]').textContent = state.isPlaying ? "Pause" : "Lecture";
      q('[data-action="shuffle"]').setAttribute("aria-pressed", String(Boolean(state.shuffle)));
      q('[data-action="repeat"]').textContent = `Répétition : ${{off:"non",context:"liste",track:"titre"}[state.repeat] || "non"}`;
      q('[data-action="repeat"]').disabled = Boolean(blocked || disallows.toggling_repeat_context || disallows.toggling_repeat_track);
      const seek = q("#music-seek"), volume = q("#music-volume");
      seek.disabled = Boolean(blocked || !state.durationMs || disallows.seeking);
      seek.max = String(state.durationMs || 1);
      if (document.activeElement !== seek) {
        seek.value = String(state.progressMs || 0);
        q(".music-position").textContent = clock(state.progressMs || 0);
      }
      q(".music-duration").textContent = clock(state.durationMs || 0);
      volume.disabled = Boolean(blocked || !state.supportsVolume);
      if (document.activeElement !== volume) {
        volume.value = String(state.volumePercent);
        q(".music-volume-value").textContent = `${state.volumePercent}%`;
      }
      q(".music-volume-note").textContent = playing && !state.supportsVolume ? "Réglez le volume sur cet appareil." : "";
      q('[data-action="transfer"]').disabled = Boolean(!q("select").value || state.busy || state.unavailable || state.status === "signed-out" || state.restricted || disallows.transferring_playback);
      q('[data-action="devices"]').disabled = state.status === "signed-out" || Boolean(state.busy);
      q(".music-feedback").textContent = state.feedback || "";
    },
    devices(devices) {
      const allowed = devices.filter(d => d.id && !d.is_restricted);
      const signature = JSON.stringify(allowed.map(d=>[d.id,d.name,d.is_active]));
      if (signature !== deviceSignature) {
        deviceSignature = signature;
        const select = q("select"), previous = select.value;
        select.replaceChildren();
        for (const device of allowed) {
          const option = document.createElement("option");
          option.value = device.id;
          option.textContent = device.name + (device.is_active ? " · actif" : "");
          select.appendChild(option);
        }
        select.value = allowed.some(d=>d.id === previous) ? previous : (allowed.find(d=>d.is_active)?.id || allowed[0]?.id || "");
      }
      q(".music-device-note").textContent = allowed.length ? "Le transfert conserve l’état lecture/pause." : "Aucun appareil disponible. Ouvrez Spotify sur votre téléphone ou enceinte, puis actualisez.";
      q('[data-action="transfer"]').disabled = transferBlocked();
    },
  };
}
