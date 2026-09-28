import * as dns from 'node:dns';

export function configureNetworkRuntime(dnsImpl=dns){
  dnsImpl.setDefaultResultOrder('ipv4first');
  return 'ipv4first';
}