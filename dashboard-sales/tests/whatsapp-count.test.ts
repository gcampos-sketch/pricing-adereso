import {test,expect} from 'bun:test';
import {countDealWhatsApp} from '../src/lib/whatsapp-count';
const row=(id:string,channel:string)=>({id,properties:{hs_communication_channel_type:channel}});
test('native WHATS_APP, legacy values and duplicates are counted per exact association',()=>{
  expect(countDealWhatsApp(['1','1','2','3'],[row('1','WHATS_APP'),row('2','WHATSAPP'),row('3','SMS'),row('foreign','WHATS_APP')])).toBe(2);
  expect(countDealWhatsApp([],[row('foreign','WHATS_APP')])).toBe(0);
});
test('partial reads are unknown rather than false zero',()=>{
  expect(countDealWhatsApp(['unread'],[])).toBeNull();
  expect(countDealWhatsApp(['1'],[row('1','LINKEDIN_MESSAGE')])).toBe(0);
});
