import { spawn } from 'node:child_process';

// FFmpeg image2pipe may split markers or combine several JPEGs in one chunk.
export function jpegParser(onFrame) {
  let buffer = Buffer.alloc(0);
  return chunk => {
    buffer = Buffer.concat([buffer,chunk]);
    while (buffer.length) {
      const start = buffer.indexOf(Buffer.from([255,216]));
      if (start < 0) { buffer = buffer.subarray(-1); return; }
      if (start) buffer = buffer.subarray(start);
      const end = buffer.indexOf(Buffer.from([255,217]),2);
      if (end < 0) { if (buffer.length > 500000) buffer = Buffer.alloc(0); return; }
      const frame = buffer.subarray(0,end+2);
      if (frame.length <= 500000) onFrame(frame);
      buffer = buffer.subarray(end+2);
    }
  };
}

export function createCameraStream(config, onError = () => {}) {
  let child = null, idleTimer = null;
  const waiting = new Set();
  function fail() { for (const waiter of waiting) { clearTimeout(waiter.timer); waiter.reject(new Error('capture_failed')); } waiting.clear(); }
  function stop() {
    clearTimeout(idleTimer);
    const previous = child; child = null;
    previous?.kill(); fail();
  }
  function start() {
    if (child) return;
    const process = spawn(config.ffmpeg,['-hide_banner','-loglevel','error','-rtsp_transport','tcp','-timeout','7000000','-analyzeduration','1000000','-probesize','500000','-i',config.rtsp,'-an','-vf','fps=4,scale=960:-2','-q:v','5','-f','image2pipe','pipe:1'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    child = process;
    // Keep FFmpeg's last error words for the log (the caller redacts the camera URL).
    let errors = '';
    process.stderr.on('data', chunk => { errors = (errors + chunk).slice(-300); });
    process.on('close', code => { if (code && errors.trim()) onError(errors.trim().split(/\r?\n/).at(-1)); });
    const parse = jpegParser(frame => {
      if (child !== process) return;
      for (const waiter of waiting) { clearTimeout(waiter.timer); waiter.resolve(frame); }
      waiting.clear();
    });
    process.stdout.on('data',parse);
    const ended = () => { if (child === process) { child = null; fail(); } };
    process.on('error',ended); process.on('close',ended);
  }
  return {
    capture() {
      clearTimeout(idleTimer); idleTimer = setTimeout(stop,10000);
      // Always wait for a newly decoded frame: never replay an old frame after an outage.
      const promise = new Promise((resolve,reject)=>{
        const waiter = {resolve,reject};
        waiter.timer = setTimeout(()=>{ waiting.delete(waiter); reject(new Error('capture_timeout')); stop(); },10000);
        waiting.add(waiter);
      });
      start(); return promise;
    },
    stop,
  };
}
