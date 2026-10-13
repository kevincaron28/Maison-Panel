import { initForecastDialog } from "./forecast-dialog.js";
export function initDashboard(config, root) {
  initForecastDialog();
  if(config.camera?.feeds?.some(f=>f.enabled!==false&&f.snapshotUrl)) {
    const opener=document.createElement("button");opener.textContent="Caméras";opener.type="button";
    const dialog=document.getElementById("camera-dialog");root.querySelector(".home-nav > div").append(opener);
    opener.addEventListener("click",()=>{dialog.showModal();document.dispatchEvent(new Event("maison-camera-visibility"));});
    document.getElementById("camera-close").addEventListener("click",()=>dialog.close());
    dialog.addEventListener("close",()=>{opener.focus();document.dispatchEvent(new Event("maison-camera-visibility"));});
  }
}
