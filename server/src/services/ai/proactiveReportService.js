const db=require('../../db');
const{getSetting}=require('../settingsService');
const{createIntelligenceService}=require('./intelligenceService');
const intelligence=createIntelligenceService(db);
function weekStart(now=Date.now()){const date=new Date(now),day=(date.getUTCDay()+6)%7;date.setUTCHours(0,0,0,0);date.setUTCDate(date.getUTCDate()-day);return date.getTime();}
function optedIn(user){try{return JSON.parse(user.preferences_json||'{}').aiReportsEnabled!==false;}catch{return true;}}
function createIfMissing(actor,current,start){const exists=db.prepare('SELECT 1 FROM ai_reports WHERE recipient_user_id=? AND realm_scope=? AND created_at_ms>=?').get(actor.id,current.scope,start);if(exists)return false;const result=intelligence.scan(current);if(!result.resourceCount)return false;intelligence.createReport({actor,current,result});return true;}
function runProactiveReports(now=Date.now()){if(getSetting('ai_proactive_reports_enabled','false')!=='true')return{enabled:false,created:0};const start=weekStart(now),users=db.prepare("SELECT * FROM users WHERE status='active'").all().filter(optedIn);let created=0;for(const user of users){if(createIfMissing(user,{scope:'personal',ownerId:user.id},start))created+=1;if(user.role==='admin'&&createIfMissing(user,{scope:'public',ownerId:null},start))created+=1;}return{enabled:true,created,users:users.length,periodStart:start};}
module.exports={runProactiveReports,weekStart,optedIn};
