import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraGroups,cameraIncidents} from '../public/camera-map.mjs';
import {demoData,deviceHealth} from '../public/model.mjs';
test('Brian has eight cameras in five areas, no recorder in map',()=>{
 const site=demoData().sites[0],groups=cameraGroups(site.devices);
 assert.deepEqual(groups.map(g=>g.cameras.length),[2,2,1,2,1]);
 assert.equal(groups[3].area,'Outside');
 assert.equal(cameraIncidents(site.devices[2],site.incidents).length,1);
 assert.equal(cameraIncidents(site.devices[0],site.incidents).length,0);
});
test('area comes only from device or unique matching setup entry',()=>{
 const device={id:'1',kind:'camera',label:'Entrance'};
 assert.equal(cameraGroups([device])[0].area,'Area not set');
 assert.equal(cameraGroups([device],[{kind:'camera',label:'entrance',area:'Outside'}])[0].area,'Outside');
 assert.equal(cameraGroups([device],[{kind:'camera',label:'entrance',area:'A'},{kind:'camera',label:'Entrance',area:'B'}])[0].area,'Area not set');
});
test('site faults never assigned to unrelated cameras and stale checks are unknown',()=>{
 const site=demoData().sites[2];
 for(const camera of site.devices){assert.equal(deviceHealth(site,camera),'unknown');assert.equal(cameraIncidents(camera,site.incidents).length,0)}
});
