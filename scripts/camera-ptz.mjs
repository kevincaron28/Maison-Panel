const directions = {left:[-0.3,0],right:[0.3,0],up:[0,0.3],down:[0,-0.3]};
export function createPtz(config) {
  const endpoint = `http://${new URL(config.rtsp).hostname}/onvif/PTZ`;
  const token = 'Profile_1';
  let moving = false;
  async function soap(action, body) {
    const response = await fetch(endpoint,{method:'POST',headers:{'Content-Type':`application/soap+xml; action="http://www.onvif.org/ver20/ptz/wsdl/${action}"`},body:`<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tt="http://www.onvif.org/ver10/schema"><s:Body><${action} xmlns="http://www.onvif.org/ver20/ptz/wsdl"><ProfileToken>${token}</ProfileToken>${body}</${action}></s:Body></s:Envelope>`,signal:AbortSignal.timeout(2000)});
    const xml = await response.text();
    if (!response.ok || !xml.includes(`${action}Response`) || /<(?:\w+:)?Fault[\s>]/.test(xml)) throw new Error('control_failed');
  }
  const stop = () => soap('Stop','<PanTilt>true</PanTilt><Zoom>true</Zoom>');
  return async action => {
    if (action === 'stop') return stop();
    if (!directions[action] || moving) throw new Error('control_unavailable');
    moving = true;
    const [x,y] = directions[action];
    try {
      await soap('ContinuousMove',`<Velocity><tt:PanTilt x="${x}" y="${y}"/></Velocity><Timeout>PT0.4S</Timeout>`);
      await new Promise(resolve=>setTimeout(resolve,250));
    } finally {
      try { await stop(); } finally { moving = false; }
    }
  };
}
