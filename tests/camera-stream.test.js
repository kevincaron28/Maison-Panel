import test from 'node:test';
import assert from 'node:assert/strict';
import { jpegParser } from '../scripts/camera-stream.mjs';

test('stream splits joined JPEGs and preserves markers across chunk boundaries',()=>{
  const frames=[]; const parse=jpegParser(frame=>frames.push([...frame]));
  parse(Buffer.from([0,255])); parse(Buffer.from([216,1,255])); parse(Buffer.from([217,255,216,2,255,217]));
  assert.deepEqual(frames,[[255,216,1,255,217],[255,216,2,255,217]]);
});
test('stream discards oversized incomplete frames and recovers at the next JPEG',()=>{
  const frames=[]; const parse=jpegParser(frame=>frames.push(frame));
  parse(Buffer.concat([Buffer.from([255,216]),Buffer.alloc(500001)]));
  parse(Buffer.from([255,216,3,255,217]));
  assert.equal(frames.length,1); assert.equal(frames[0].length,5);
});

import { findCamera, macFromArp, normalizeMac, redact } from '../scripts/camera-discovery.mjs';
test('camera URL credentials never reach the log',()=>{
  assert.equal(redact('Error opening rtsp://admin:s3cret@192.168.1.12:554/stream1'),'Error opening rtsp://***@192.168.1.12:554/stream1');
});
test('ARP output is parsed to a normalized MAC',()=>{
  const out='\r\nInterface: 192.168.1.224 --- 0x7\r\n  Internet Address      Physical Address      Type\r\n  192.168.1.40          44-01-bb-ec-b3-13     dynamic\r\n';
  assert.equal(macFromArp(out,'192.168.1.40'),'4401bbecb313');
  assert.equal(macFromArp(out,'192.168.1.4'),'');
  assert.equal(normalizeMac('44:01:BB:EC:B3:13'),'4401bbecb313');
});
test('rediscovery finds the camera at a new DHCP address by MAC only',async()=>{
  const open=new Set(['192.168.1.20','192.168.1.40']);
  const macs={'192.168.1.20':'aa-bb-cc-dd-ee-ff','192.168.1.40':'44-01-bb-ec-b3-13'};
  const probe=async host=>open.has(host);
  const lookup=async host=>`  ${host}   ${macs[host]}   dynamic`;
  assert.equal(await findCamera('192.168.1.12','44:01:BB:EC:B3:13',{probe,lookup}),'192.168.1.40');
  assert.equal(await findCamera('192.168.1.12','00:00:00:00:00:01',{probe,lookup}),null,'another RTSP device is never adopted');
  assert.equal(await findCamera('192.168.1.12','',{probe,lookup}),null,'no MAC configured: no scanning');
});
