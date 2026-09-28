import test from 'node:test';
import assert from 'node:assert/strict';
import { configureNetworkRuntime } from '../desktop/network-runtime.js';

test('Electron network runtime applies IPv4-first exactly once',()=>{
  const calls=[];
  const result=configureNetworkRuntime({setDefaultResultOrder:value=>calls.push(value)});
  assert.equal(result,'ipv4first');
  assert.deepEqual(calls,['ipv4first']);
});