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
