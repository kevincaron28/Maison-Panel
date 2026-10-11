const status = document.getElementById("settings-status");
const input = document.getElementById("market-key");
document.getElementById("current-url").textContent = location.origin + "/";
document.getElementById("spotify-redirect").textContent = location.origin + "/";
try {
  const hasSession = Boolean(localStorage.getItem("maison-panel:spotify-tokens"));
  document.getElementById("spotify-storage-status").textContent = hasSession
    ? "Une session Spotify est enregistrée dans ce navigateur."
    : "Aucune session Spotify enregistrée dans ce navigateur.";
} catch {
  document.getElementById("spotify-storage-status").textContent = "Le stockage est bloqué : autorisez les données de site pour conserver la connexion.";
}
document.getElementById("device-status").textContent = navigator.onLine
  ? "Connexion réseau disponible"
  : "Hors ligne";
document
  .getElementById("market-settings")
  .addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      if (!input.value.trim()) {
        status.textContent = "Saisissez une clé, ou utilisez Déconnecter.";
        return;
      }
      localStorage.setItem("maison-panel:fmp-key", input.value.trim());
      input.value = "";
      status.textContent =
        "Enregistré. Revenez au panneau pour charger les marchés.";
    } catch {
      status.textContent = "Le stockage du navigateur est indisponible.";
    }
  });
document.getElementById("remove-key").addEventListener("click", () => {
  try {
    localStorage.removeItem("maison-panel:fmp-key");
    status.textContent = "Marchés déconnectés.";
  } catch {
    status.textContent = "Le stockage du navigateur est indisponible.";
  }
});
