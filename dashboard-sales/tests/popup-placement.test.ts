import { test, expect } from 'bun:test';
import { popupOverTrigger } from '../src/lib/popup-placement';
const viewport = {width:1200,height:800};
test('details overlay their source instead of centering or opening below it',()=>{
  expect(popupOverTrigger({left:80,top:160,width:150,height:190},{width:520,height:400},viewport)).toEqual({left:80,top:160,width:520,height:400});
});
test('right and bottom edges displace only the required distance',()=>{
  expect(popupOverTrigger({left:1050,top:650,width:100,height:80},{width:520,height:400},viewport)).toEqual({left:668,top:388,width:520,height:400});
});
test('narrow screens bound both dimensions without overflowing',()=>{
  expect(popupOverTrigger({left:4,top:0,width:100,height:80},{width:520,height:900},{width:360,height:640})).toEqual({left:12,top:12,width:336,height:616});
});
