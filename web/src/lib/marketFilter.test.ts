import assert from 'node:assert/strict'
import { test } from 'vitest'
import {emptyMarketFilter,passesMarketFilter,filterMarket,parseMarketFilter} from './marketFilter'
// Copied from the console fork's scripts/tests/market-filter.test.cjs (topic15/ponty-ron-buys).

const row=(over={})=>({name:'Amulet of Strength',key:'stramulet',level:1,price:5000,tier:2,firstSeenAt:100,...over});
const pass=(filter,entry=row())=>passesMarketFilter(entry,{...emptyMarketFilter,...filter});

test('an empty filter passes every row, including rows with missing fields',()=>{
 assert.equal(pass({}),true);
 assert.equal(pass({},{name:'Coat',key:'coat'}),true);
});

test('upgrade level bounds are inclusive and a missing level counts as +0',()=>{
 assert.equal(pass({minLevel:1}),true);assert.equal(pass({minLevel:2}),false);
 assert.equal(pass({maxLevel:1}),true);assert.equal(pass({maxLevel:0}),false);
 assert.equal(pass({maxLevel:0},row({level:undefined})),true);
 assert.equal(pass({minLevel:1},row({level:undefined})),false);
});

test('price bounds are inclusive and a row without a price passes only without a price bound',()=>{
 assert.equal(pass({maxPrice:5000}),true);assert.equal(pass({maxPrice:4999}),false);
 assert.equal(pass({minPrice:5000}),true);assert.equal(pass({minPrice:5001}),false);
 assert.equal(pass({maxPrice:10},row({price:undefined})),false);
 assert.equal(pass({},row({price:undefined})),true);
});

test('every keyword must match the display name or item key, ignoring case',()=>{
 assert.equal(pass({keywords:'amulet STR'}),true);
 assert.equal(pass({keywords:'stramulet'}),true);
 assert.equal(pass({keywords:'amulet int'}),false);
 assert.equal(pass({keywords:'   '}),true);
});

test('tier bounds are inclusive and an item without a tier passes only without a tier bound',()=>{
 assert.equal(pass({minTier:2}),true);assert.equal(pass({minTier:3}),false);
 assert.equal(pass({maxTier:2}),true);assert.equal(pass({maxTier:1}),false);
 assert.equal(pass({maxTier:5},row({tier:undefined})),false);
 assert.equal(pass({keywords:'amulet'},row({tier:undefined})),true);
});

test('bounds combine, and the sort is newest first by default with price and level as alternatives',()=>{
 const rows=[row({key:'a',level:0,price:300,firstSeenAt:10}),row({key:'b',level:3,price:100,firstSeenAt:30}),
  row({key:'c',level:1,price:200,firstSeenAt:undefined}),row({key:'d',level:2,price:900,firstSeenAt:20})];
 const keys=(filter)=>filterMarket(rows,{...emptyMarketFilter,...filter},entry=>entry).map(entry=>entry.key);
 assert.deepEqual(keys({}),['b','d','a','c'],'a row with no first-seen time sorts last');
 assert.deepEqual(keys({sort:'price'}),['b','c','a','d']);
 assert.deepEqual(keys({sort:'level'}),['b','d','c','a']);
 assert.deepEqual(keys({minLevel:1,maxPrice:500}),['b','c']);
});

test('a stored filter parses back and rejects malformed values',()=>{
 assert.deepEqual(parseMarketFilter(JSON.stringify({...emptyMarketFilter,minLevel:2,sort:'price'})),{...emptyMarketFilter,minLevel:2,sort:'price'});
 assert.deepEqual(parseMarketFilter('{"minLevel":"x","sort":"cheap","keywords":5}'),emptyMarketFilter);
 assert.deepEqual(parseMarketFilter('not json'),emptyMarketFilter);
 assert.deepEqual(parseMarketFilter(null),emptyMarketFilter);
});
