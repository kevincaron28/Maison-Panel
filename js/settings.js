const status = document.getElementById("settings-status");
const input = document.getElementById("market-key");
document.getElementById("current-url").textContent = location.origin + "/";
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
