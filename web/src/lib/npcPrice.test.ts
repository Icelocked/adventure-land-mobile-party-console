import assert from 'node:assert/strict'
import { test } from 'vitest'
import {itemValue,npcUnitPrice,levelPrices,estimateTotal} from './npcPrice'
// Copied from the console fork's scripts/tests/npc-price.test.cjs (topic15/ponty-ron-buys).
// npc-price.ts mirrors calculate_item_value (js/old_common_functions.js:808-847,
// adventureland_mongodb 16881a27) and the sbuy multipliers (node/server.js:8306-8388).
const defs={
 coat:{g:1000,upgrade:{}},
 ring:{g:1000,compound:{}},
 cashy:{g:50,cash:1},
 marked:{g:900,markup:3},
 scroll0:{g:1000},scroll1:{g:40000},scroll2:{g:1600000},
 cscroll0:{g:6400},cscroll1:{g:240000},cscroll2:{g:9200000},
};

test('item value follows calculate_item_value at +0, upgrade levels and compound levels',()=>{
 assert.equal(itemValue(defs,'coat',0),600);
 assert.equal(itemValue(defs,'coat',1),1100,'0.6 g plus half a scroll0');
 assert.equal(itemValue(defs,'coat',4),2*600+4*500,'+4 doubles the base value');
 assert.equal(itemValue(defs,'ring',1),Math.round(600*3.2+6400/2.4));
 assert.equal(itemValue(defs,'cashy',0),50,'cash items take their full g');
 assert.equal(itemValue(defs,'marked',0),180,'markup divides the value');
 assert.equal(itemValue(defs,'unknown',0),0,'an item the catalog lacks has no price');
});

test('Ponty charges twice the value, three times for cash items, and Ron four times',()=>{
 assert.equal(npcUnitPrice(defs,'coat',0,'ponty'),1200);
 assert.equal(npcUnitPrice(defs,'cashy',0,'ponty'),150);
 assert.equal(npcUnitPrice(defs,'coat',0,'ron'),2400);
 assert.equal(npcUnitPrice(defs,'cashy',0,'ron'),200,'Ron has no cash multiplier');
});

test('a level range lists the unit price of every included level',()=>{
 assert.deepEqual(levelPrices(defs,'coat',0,1,'ponty'),[{level:0,unitPrice:1200},{level:1,unitPrice:2200}]);
 assert.deepEqual(levelPrices(defs,'coat',1,0,'ron'),[{level:0,unitPrice:2400},{level:1,unitPrice:4400}],'a reversed range still lists both');
});

test('the estimated total spans the cheapest to the dearest level, or one figure for one level',()=>{
 assert.deepEqual(estimateTotal(levelPrices(defs,'coat',0,1,'ponty'),300),{low:360000,high:660000});
 assert.deepEqual(estimateTotal(levelPrices(defs,'coat',0,0,'ponty'),3),{low:3600,high:3600});
 assert.equal(estimateTotal(levelPrices(defs,'coat',0,0,'ponty'),null),null,'until stopped has no total');
});
