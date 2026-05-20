// DualMind v2 — Names ABOVE bubbles, not inside
var streaming=false,activeOc=null,activeHm=null;
var $=function(id){return document.getElementById(id)};
var msgs=$('chat-msgs'),inp=$('chat-inp'),sbtn=$('send-btn');
var OC_AV='<img src=\"/oc-avatar.png\" alt=\"OC\">';
var HM_AV='<img src=\"/hermes-avatar.png\" alt=\"HM\">';
var selectedTurnId=null;
var lastStatus=null;
var LANG=localStorage.getItem('dualmind_lang')||(((navigator.language||'').toLowerCase().indexOf('zh')===0)?'zh':'en');
var I18N={zh:{},en:{}};
var i18nLoaded=false;
async function loadI18n(){
  async function loadOne(lang){
    try{var r=await fetch('/i18n/'+lang+'.json?v=2026.5.20.1');if(r.ok)return await r.json();}
    catch(e){}
    return {};
  }
  I18N={zh:await loadOne('zh'),en:await loadOne('en')};
  i18nLoaded=true;
}
function tr(k){return (I18N[LANG]&&I18N[LANG][k])||(I18N.zh&&I18N.zh[k])||(I18N.en&&I18N.en[k])||k;}
function applyLang(){document.documentElement.lang=LANG==='zh'?'zh-CN':'en';document.querySelectorAll('[data-i18n]').forEach(function(el){el.textContent=tr(el.dataset.i18n);});document.querySelectorAll('[data-i18n-html]').forEach(function(el){el.innerHTML=tr(el.dataset.i18nHtml);});document.querySelectorAll('[data-i18n-title]').forEach(function(el){el.title=tr(el.dataset.i18nTitle);});if(inp)inp.placeholder=tr('inputPlaceholder');var sel=$('lang-select');if(sel)sel.value=LANG;var role=$('role-mode'),dict=I18N[LANG]||I18N.zh||{};if(role){Array.from(role.options).forEach(function(o){o.textContent=(dict.roleOptions&&dict.roleOptions[o.value])||o.textContent;});}updatePolicyStrip(lastStatus);}

async function loadFromServer(){
  try{var r=await fetch('/api/history');var d=await r.json();
  if(d.messages&&d.messages.length>0){msgs.innerHTML='';hideWelcome();
  var lastTurnKey='';
  for(var i=0;i<d.messages.length;i++){var m=d.messages[i];
  var turnKey=m.turnId||'';
  if(turnKey&&turnKey!==lastTurnKey){sysMsg(turnMetaText(m));lastTurnKey=turnKey;}
  if(m.t==='user')addMsg('user','',m.c,m);
  else if(m.t==='oc')addMsg('oc',OC_AV,m.c,m);
  else if(m.t==='hm')addMsg('hm',HM_AV,m.c,m);}
  scroll();}}catch(e){}
}
function openPanel(tab){
  document.querySelectorAll('.nav-btn').forEach(function(x){x.classList.remove('active')});
  document.querySelectorAll('.panel').forEach(function(p){p.classList.remove('active')});
  var btn=document.querySelector('.nav-btn[data-tab="'+tab+'"]'),panel=$('panel-'+tab);
  if(btn)btn.classList.add('active');
  if(panel)panel.classList.add('active');
  if(tab==='turns')loadTurns();
}
document.querySelectorAll('.nav-btn').forEach(function(b){b.addEventListener('click',function(){
  if(b.onclick)return;
  openPanel(b.dataset.tab);
})});

function insertMention(text){var cur=inp.value,pos=inp.selectionStart;inp.value=cur.slice(0,pos)+text+cur.slice(pos);inp.focus();inp.selectionStart=inp.selectionEnd=pos+text.length;inp.dispatchEvent(new Event('input'));}
inp.addEventListener('dblclick',function(){if(inp.value.includes('@')){inp.value=inp.value.replace(/@(OpenClaw|Hermes)\s*/g,'');inp.dispatchEvent(new Event('input'));}});

function toggleTheme(){var cur=document.documentElement.getAttribute('data-theme')||'dark';var next=cur==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',next);localStorage.setItem('dualmind_theme',next);}
(function(){var t=localStorage.getItem('dualmind_theme');if(t)document.documentElement.setAttribute('data-theme',t);})();
function exportChat(){var txt='';var items=msgs.querySelectorAll('.cmsg');for(var i=0;i<items.length;i++){var el=items[i];if(el.classList.contains('user'))txt+=tr('exportUser')+': ';else if(el.classList.contains('oc'))txt+='OpenClaw: ';else if(el.classList.contains('hm'))txt+='Hermes: ';txt+=(el.querySelector('.c-bubble')?.textContent||'')+'\n\n';}var b=new Blob([txt],{type:'text/markdown'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='dualmind-'+new Date().toISOString().slice(0,10)+'.md';a.click();}

function agentHealthText(status,last,isOpenClaw){
  status=status||{};last=last||{};
  if(!status.running&&!status.binPath)return tr('offline');
  if(last.ok===true)return tr('replyOk');
  if(last.ok===false){
    var error=String(last.error||'');
    if(/429|quota|usage limit|额度/i.test(error))return tr('quotaLimited');
    return tr('replyFailed');
  }
  if(isOpenClaw&&status.gatewayRunning)return tr('gatewayOnline');
  return status.running?tr('cliReady'):tr('offline');
}

function roleLabel(mode){
  var dict=(I18N[LANG]||I18N.zh||{}).roleOptions||{};
  return dict[mode]||mode||'-';
}
function executorForMode(mode){
  if(mode==='openclaw-main')return 'oc';
  if(mode==='hermes-main')return 'hm';
  return null;
}
function displayExecutor(meta){
  meta=meta||{};
  return meta.executor||executorForMode(meta.roleMode);
}
function streamModeLabel(mode){
  return mode==='true-stream'?tr('streamTrue'):tr('streamSimulated');
}
function discussionLabel(style){
  return style?tr('discussionStyle_'+style):'';
}
function turnMetaText(meta){
  meta=meta||{};
  var parts=[];
  if(meta.roleMode)parts.push(tr('mode')+': '+roleLabel(meta.roleMode));
  if(meta.intent)parts.push(tr('turnIntent')+': '+meta.intent);
  if(meta.discussionStyle)parts.push(tr('discussionStyle')+': '+discussionLabel(meta.discussionStyle));
  if(meta.primary||meta.secondary)parts.push(tr('turnParticipants')+': '+[meta.primary,meta.secondary].filter(Boolean).map(agentLabel).join(' + '));
  var metaExecutor=displayExecutor(meta);
  if(metaExecutor)parts.push(tr('execute')+': '+agentLabel(metaExecutor));
  else if(meta.roleMode)parts.push(tr('execute')+': '+tr('turnNone'));
  if(meta.turnId)parts.push(tr('turn')+': '+String(meta.turnId).slice(-6));
  return parts.join(' · ');
}
function updatePolicyStrip(status){
  status=status||lastStatus||{};
  var config=status.config||{};
  var selectedMode=$('role-mode')?$('role-mode').value:'';
  var mode=selectedMode||config.roleMode||'openclaw-main';
  var executor=executorForMode(mode);
  var safety=config.safety||{};
  var caps=status.capabilities||{};
  var ocMode=(caps.oc&&caps.oc.streamingMode)||'simulated';
  var hmMode=(caps.hm&&caps.hm.streamingMode)||'simulated';
  var modeChip=$('mode-chip'),executorChip=$('executor-chip'),remoteChip=$('remote-chip'),streamChip=$('stream-chip');
  if(modeChip)modeChip.textContent=tr('currentMode')+': '+roleLabel(mode);
  if(executorChip)executorChip.textContent=tr('currentExecutor')+': '+agentLabel(executor);
  if(remoteChip){remoteChip.textContent=safety.allowRemoteCodeExecution?tr('remoteCodeOn'):tr('remoteCodeOff');remoteChip.className='policy-chip '+(safety.allowRemoteCodeExecution?'danger':'safe');}
  if(streamChip)streamChip.textContent=tr('streaming')+': OpenClaw '+streamModeLabel(ocMode)+' / Hermes '+streamModeLabel(hmMode);
  updateExecutionCapability(status);
}

function executionSummary(caps){
  caps=caps||{};
  if(caps.toolExecution&&(caps.canExecuteFiles||caps.canRunCommands))return tr('execReady');
  return tr('execReadOnly');
}

function updateExecutionCapability(status){
  status=status||lastStatus||{};
  var caps=status.capabilities||{};
  var oc=$('oc-exec-cap'),hm=$('hm-exec-cap'),cur=$('current-exec-cap');
  if(oc)oc.textContent=executionSummary(caps.oc);
  if(hm)hm.textContent=executionSummary(caps.hm);
  if(cur){
    var mode=$('role-mode')?$('role-mode').value:(status.config&&status.config.roleMode)||'openclaw-main';
    var executor=executorForMode(mode);
    var currentCaps=executor==='hm'?caps.hm:caps.oc;
    var ready=currentCaps&&currentCaps.toolExecution&&(currentCaps.canExecuteFiles||currentCaps.canRunCommands);
    cur.textContent=ready?tr('currentExecReady'):tr('currentExecBlocked');
    cur.className='cap-current '+(ready?'ok':'warn');
  }
}

async function ck(){try{var r=await fetch('/api/status');var d=await r.json();
  lastStatus=d;
  var ocImg=document.querySelector('#oc-dot-img');if(ocImg)ocImg.className='s-avatar '+(d.openclaw.running?'online':'');
  var hImg=document.querySelector('#h-dot-img');if(hImg)hImg.className='s-avatar '+(d.hermes.running?'online':'');
  $('oc-detail').textContent=agentHealthText(d.openclaw,d.agents&&d.agents.oc,true);
  $('h-detail').textContent=agentHealthText(d.hermes,d.agents&&d.agents.hm,false);
  if(d.config?.openclaw?.binPath)$('oc-path').value=d.config.openclaw.binPath;
  if(d.config?.openclaw?.gatewayUrl)$('oc-url').value=d.config.openclaw.gatewayUrl;
  if(d.config?.openclaw?.mode&&$('oc-mode'))$('oc-mode').value=d.config.openclaw.mode;
  if(d.config?.hermes?.binPath)$('h-path').value=d.config.hermes.binPath;
  if(d.config?.roleMode)$('role-mode').value=d.config.roleMode;
  if(d.config?.server?.port)$('srv-p').value=d.config.server.port;
  if(d.config?.wechat&&$('enable-wx'))$('enable-wx').checked=!!d.config.wechat.enabled;
  if(d.config?.safety&&$('confirm-risky'))$('confirm-risky').checked=d.config.safety.confirmRisky!==false;
  if(d.config?.safety&&$('allow-remote-code'))$('allow-remote-code').checked=!!d.config.safety.allowRemoteCodeExecution;
  updatePolicyStrip(d);
  updateWxUI(d.wechat);
}catch(e){$('oc-detail').textContent=$('h-detail').textContent=tr('offline');}}

var wxPairSessionKey='';
function updateWxUI(wx){var st=$('wx-status');$('wx-actions').style.display='block';
  var installBtn=$('wx-install-btn');if(installBtn)installBtn.style.display='inline-block';
  if(wx&&wx.configured){st.textContent=tr('wxConnected')+(wx.accountCount?' · '+wx.accountCount+' '+tr('wxAccounts'):'');$('wx-pair-btn').style.display='inline-block';}
  else if(wx&&wx.installed){st.textContent=tr('wxInstalledNeedsPair');$('wx-pair-btn').style.display='inline-block';}
  else if(wx&&wx.installerBundled){st.textContent=tr('wxPluginBundled');$('wx-pair-btn').style.display='inline-block';}
  else{st.textContent=(wx&&wx.error)?tr('wxGatewayMissing')+': '+wx.error:tr('wxGatewayMissing');$('wx-pair-btn').style.display='inline-block';}
  $('wx-pair-btn').disabled=!$('enable-wx').checked;}
function validHttpUrl(value){try{var u=new URL(value);return u.protocol==='http:'||u.protocol==='https:';}catch(e){return false;}}
function validImageSrc(value){return validHttpUrl(value)||String(value||'').indexOf('data:image/')===0;}
function resetWxPair(){wxPairSessionKey='';var box=$('wx-pair-result'),img=$('wx-qr-img'),msg=$('wx-pair-msg'),link=$('wx-qr-link');if(box)box.style.display='none';if(img){img.style.display='none';img.removeAttribute('src');}if(msg)msg.textContent='';if(link){link.style.display='none';link.removeAttribute('href');link.textContent='';}$('wx-confirm-btn').style.display='none';}
if($('wx-install-btn'))$('wx-install-btn').addEventListener('click',async function(){
  resetWxPair();
  var btn=this;btn.textContent='..';btn.disabled=true;
  var box=$('wx-pair-result'),msg=$('wx-pair-msg');
  try{
    var r=await fetch('/api/wechat/install',{method:'POST'});var d=await r.json();
    box.style.display='block';
    msg.textContent=d.ok?tr('wxInstallOk'):tr('wxInstallIncomplete')+(d.output?': '+d.output:'');
    await ck();
  }catch(e){
    box.style.display='block';msg.textContent=e.message||tr('wxInstallIncomplete');
  }
  btn.textContent=tr('installWechatPlugin');btn.disabled=false;
});
$('wx-pair-btn').addEventListener('click',async function(){
  resetWxPair();
  this.textContent='..';this.disabled=true;
  try{
    var r=await fetch('/api/wechat/pair');var d=await r.json();
    var box=$('wx-pair-result'),img=$('wx-qr-img'),msg=$('wx-pair-msg'),link=$('wx-qr-link');
    box.style.display='block';
    wxPairSessionKey=d.sessionKey||'';
    if(d.ok&&(validImageSrc(d.qrImage)||validHttpUrl(d.qrUrl))){
      img.src=validImageSrc(d.qrImage)?d.qrImage:d.qrUrl;img.style.display='block';
      link.style.display='inline';link.href=d.qrUrl;link.textContent=tr('openQr');
      msg.textContent=tr('qrReady')+(d.expiresAt?' '+d.expiresAt:'');
      $('wx-confirm-btn').style.display='inline-block';
    }else if(d.ok&&validHttpUrl(d.pairingUrl)){
      link.style.display='inline';link.href=d.pairingUrl;link.textContent=tr('openPairPage');
      msg.textContent=tr('pairingReady')+(d.expiresAt?' '+d.expiresAt:'');
      $('wx-confirm-btn').style.display='inline-block';
    }else{
      msg.textContent=(d.error||tr('qrUnavailable'))+(d.gatewayUrl?' Gateway: '+d.gatewayUrl:'');
      link.style.display='none';
      $('wx-confirm-btn').style.display='none';
    }
  }catch(e){
    $('wx-pair-result').style.display='block';
    $('wx-pair-msg').textContent=e.message||tr('qrUnavailable');
  }
  this.textContent=tr('getQr');this.disabled=!$('enable-wx').checked;
});
$('wx-confirm-btn').addEventListener('click',async function(){var btn=this;btn.textContent='..';btn.disabled=true;try{var r=await fetch('/api/wechat/pair/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionKey:wxPairSessionKey})});var d=await r.json();$('sv-st').textContent=d.ok?tr('pairOk'):(d.error||tr('pairPending'));$('sv-st').className='save-status show';if(d.ok){btn.textContent=tr('pairOk');await ck();}else{btn.textContent=tr('confirmPair');btn.disabled=false;}}catch(e){$('sv-st').textContent=e.message||tr('pairPending');$('sv-st').className='save-status show';btn.textContent=tr('confirmPair');btn.disabled=false;}});
$('enable-wx').onchange=function(){$('wx-pair-btn').disabled=!this.checked;if(!this.checked)resetWxPair();};

$('save-btn').addEventListener('click',async function(){var p={openclaw:{binPath:$('oc-path').value.trim(),gatewayUrl:$('oc-url').value.trim(),mode:$('oc-mode')?$('oc-mode').value:'agent'},hermes:{binPath:$('h-path').value.trim()},wechat:{enabled:$('enable-wx').checked},roleMode:$('role-mode').value,server:{port:Number($('srv-p').value||3000)},safety:{confirmRisky:$('confirm-risky')?$('confirm-risky').checked:true,allowRemoteCodeExecution:$('allow-remote-code')?$('allow-remote-code').checked:false}};this.textContent='..';this.disabled=true;await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});$('sv-st').textContent=tr('saved');$('sv-st').className='save-status show';setTimeout(function(){$('sv-st').className='save-status';},2000);this.textContent=tr('saveSettings');this.disabled=false;ck();});
$('detect-btn').addEventListener('click',function(){var s=this;this.textContent='..';ck().finally(function(){s.textContent=tr('detectAgain');});});
$('restart-btn').addEventListener('click',async function(){if(!confirm(tr('restartConfirm')))return;await fetch('/api/restart',{method:'POST'});$('sv-st').textContent=tr('restarting');$('sv-st').className='save-status show';setTimeout(function(){location.reload();},2000);});

async function testAgent(agent){
  var btn=$(agent==='oc'?'oc-test-btn':'h-test-btn'),st=$(agent==='oc'?'oc-test-st':'h-test-st');
  if(!btn||!st)return;
  btn.disabled=true;st.className='test-status';st.textContent=tr('testing');
  try{
    var r=await fetch('/api/agents/'+agent+'/test',{method:'POST'});
    var d=await r.json();
    if(d.ok){st.className='test-status ok';st.textContent=tr('testOk')+(d.content?': '+d.content:'');}
    else{st.className='test-status bad';st.textContent=tr('testFailed')+': '+(d.error||'');}
  }catch(e){
    st.className='test-status bad';st.textContent=tr('testFailed')+': '+(e.message||e);
  }
  btn.disabled=false;ck();
}
if($('oc-test-btn'))$('oc-test-btn').addEventListener('click',function(){testAgent('oc');});
if($('h-test-btn'))$('h-test-btn').addEventListener('click',function(){testAgent('hm');});
if($('role-mode'))$('role-mode').addEventListener('change',function(){updatePolicyStrip(lastStatus);});
if($('oc-mode'))$('oc-mode').addEventListener('change',function(){lastStatus=lastStatus||{};lastStatus.capabilities=lastStatus.capabilities||{};if(lastStatus.capabilities.oc){var agentMode=this.value==='agent';lastStatus.capabilities.oc.toolExecution=agentMode;lastStatus.capabilities.oc.canExecuteFiles=agentMode;lastStatus.capabilities.oc.canRunCommands=agentMode;lastStatus.capabilities.oc.readOnlyMode=!agentMode;}updatePolicyStrip(lastStatus);});
if($('allow-remote-code'))$('allow-remote-code').addEventListener('change',function(){lastStatus=lastStatus||{};lastStatus.config=lastStatus.config||{};lastStatus.config.safety=lastStatus.config.safety||{};lastStatus.config.safety.allowRemoteCodeExecution=this.checked;updatePolicyStrip(lastStatus);});

inp.addEventListener('input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px';sbtn.disabled=!this.value.trim()||streaming;});
inp.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
sbtn.addEventListener('click',send);

function clientRisky(text){return /删除|重置|清空|rm\s|reset|kill|卸载|delete|remove|wipe/i.test(text||'');}
async function send(){var txt=inp.value.trim();if(!txt||streaming)return;
  var confirmRisky=false;
  if(clientRisky(txt)){confirmRisky=window.confirm(tr('riskyConfirmPrompt'));if(!confirmRisky){sysMsg(tr('riskyConfirmRequired'));return;}}
  var oc=/@OpenClaw/i.test(txt),hm=/@Hermes/i.test(txt);var agent=oc&&!hm?'oc':hm&&!oc?'hm':null;
  addMsg('user','',txt);inp.value='';inp.style.height='auto';sbtn.disabled=true;scroll();
  streaming=true;sbtn.classList.add('sending');sbtn.innerHTML='.';activeOc=null;activeHm=null;
  try{var roleMode=$('role-mode')?$('role-mode').value:'openclaw-main';var r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:txt}],agent:agent,roleMode:roleMode,confirmRisky:confirmRisky})});
  if(!r.ok)throw new Error('HTTP '+r.status);var reader=r.body.getReader(),dec=new TextDecoder(),buf='';
  while(true){var item=await reader.read();if(item.done)break;buf+=dec.decode(item.value,{stream:true});
  var lines=buf.split('\n');buf=lines.pop()||'';
  for(var i=0;i<lines.length;i++){var l=lines[i].trim();if(!l||!l.startsWith('data:'))continue;
  var raw=l.slice(6);if(raw==='[DONE]')continue;
  try{var c=JSON.parse(raw);
	  if(c.t==='e'){sysMsg(c.d);continue;}
	  if(c.t==='agentError'){markThinkError(c.a,(c.a==='oc'?'OpenClaw':'Hermes')+': '+c.d);continue;}
	  if(c.t==='executionBlocked'){sysMsg(tr('executionBlocked')+': '+(c.d||''));continue;}
	  if(c.t==='confirmRisky'){sysMsg(tr('riskyConfirmRequired'));continue;}
	  if(c.t==='turnStart'){sysMsg(turnMetaText(c));continue;}
	  if(c.t==='actionLease'){sysMsg(tr('actionLease')+': '+agentLabel(c.lease&&(c.lease.owner||c.lease.agent))+' · '+(c.lease&&c.lease.intent?c.lease.intent:''));continue;}
	  if(c.t==='policyWarning'){sysMsg(tr('policyWarning')+': '+(c.d||''));continue;}
	  if(c.t==='turnDone'){continue;}
	  if(c.t==='think'){showThink(c.a,c.d);continue;}
  if(c.t==='doneThink'){hideThink(c.a);continue;}
  if(c.t==='verify'){sysMsg(c.d);continue;}
  if(c.t==='c'&&c.a==='oc'){if(!c.f&&!activeOc)activeOc=createLive('oc',OC_AV);if(activeOc){appendAgentChunk(activeOc,c.d);scroll();}if(c.f&&activeOc){activeOc.querySelector('.c-bubble').classList.remove('streaming');renderAgentMarkdown(activeOc);activeOc=null;}}
  if(c.t==='c'&&c.a==='hm'){if(!c.f&&!activeHm)activeHm=createLive('hm',HM_AV);if(activeHm){appendAgentChunk(activeHm,c.d);scroll();}if(c.f&&activeHm){activeHm.querySelector('.c-bubble').classList.remove('streaming');renderAgentMarkdown(activeHm);activeHm=null;}}
  }catch(e){}}}
  }catch(e){sysMsg(e.message);}
  streaming=false;sbtn.classList.remove('sending');sbtn.innerHTML='>';sbtn.disabled=false;
}

function splitTableRow(line){
  var value=String(line||'').trim(),cells=[],cell='',inCode=false;
  if(value.charAt(0)==='|')value=value.slice(1);
  if(value.charAt(value.length-1)==='|')value=value.slice(0,-1);
  for(var i=0;i<value.length;i++){
    var ch=value.charAt(i),next=value.charAt(i+1);
    if(ch==='\\'&&next==='|'){cell+='|';i++;continue;}
    if(ch==='`')inCode=!inCode;
    if(ch==='|'&&!inCode){cells.push(cell.trim());cell='';continue;}
    cell+=ch;
  }
  cells.push(cell.trim());
  return cells;
}
function isTableDivider(line){
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line||'');
}
function inlineMd(text){
  var html=esc(text||'');
  html=html.replace(/`([^`]+)`/g,function(_,code){return '<code>'+code+'</code>';});
  html=html.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  html=html.replace(/__([^_]+)__/g,'<strong>$1</strong>');
  html=html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,function(_,label,url){return '<a href="'+url+'" target="_blank" rel="noopener noreferrer">'+label+'</a>';});
  return html;
}
function renderMarkdown(text){
  var lines=String(text||'').replace(/\r\n/g,'\n').split('\n');
  var html=[],i=0,inCode=false,codeLang='',codeLines=[];
  function flushCode(){html.push('<pre><code'+(codeLang?' data-lang="'+esc(codeLang)+'"':'')+'>'+esc(codeLines.join('\n'))+'</code></pre>');codeLines=[];codeLang='';}
  function paragraph(){
    var parts=[];
    while(i<lines.length&&lines[i].trim()&&!/^\s{0,3}#{1,4}\s+/.test(lines[i])&&!/^\s*([-*+]\s+|\d+\.\s+)/.test(lines[i])&&!/^\s*>/.test(lines[i])&&!(/^.*\|.*$/.test(lines[i])&&isTableDivider(lines[i+1]))&&!/^```/.test(lines[i])){
      parts.push(lines[i]);i++;
    }
    if(parts.length)html.push('<p>'+inlineMd(parts.join('\n')).replace(/\n/g,'<br>')+'</p>');
  }
  while(i<lines.length){
    var line=lines[i];
    if(/^```/.test(line)){
      if(inCode){flushCode();inCode=false;}else{inCode=true;codeLang=line.replace(/^```/,'').trim().slice(0,24);}
      i++;continue;
    }
    if(inCode){codeLines.push(line);i++;continue;}
    if(!line.trim()){i++;continue;}
    var heading=line.match(/^\s{0,3}(#{1,4})\s+(.+)$/);
    if(heading){var level=Math.min(4,heading[1].length+1);html.push('<h'+level+'>'+inlineMd(heading[2])+'</h'+level+'>');i++;continue;}
    if(/^.*\|.*$/.test(line)&&isTableDivider(lines[i+1])){
      var heads=splitTableRow(line);i+=2;var rows=[];
      while(i<lines.length&&lines[i].trim()&&/^.*\|.*$/.test(lines[i])){rows.push(splitTableRow(lines[i]));i++;}
      html.push('<div class="md-table-wrap"><table><thead><tr>'+heads.map(function(c){return '<th>'+inlineMd(c)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+row.map(function(c){return '<td>'+inlineMd(c)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>');
      continue;
    }
    if(/^\s*[-*+]\s+/.test(line)||/^\s*\d+\.\s+/.test(line)){
      var ordered=/^\s*\d+\.\s+/.test(line),tag=ordered?'ol':'ul',items=[];
      while(i<lines.length&&(ordered?/^\s*\d+\.\s+/.test(lines[i]):/^\s*[-*+]\s+/.test(lines[i]))){
        items.push(lines[i].replace(ordered?/^\s*\d+\.\s+/:/^\s*[-*+]\s+/,''));
        i++;
      }
      html.push('<'+tag+'>'+items.map(function(item){return '<li>'+inlineMd(item)+'</li>';}).join('')+'</'+tag+'>');
      continue;
    }
    if(/^\s*>/.test(line)){
      var quotes=[];
      while(i<lines.length&&/^\s*>/.test(lines[i])){quotes.push(lines[i].replace(/^\s*>\s?/,''));i++;}
      html.push('<blockquote>'+inlineMd(quotes.join('\n')).replace(/\n/g,'<br>')+'</blockquote>');
      continue;
    }
    paragraph();
  }
  if(inCode)flushCode();
  return html.join('');
}
function renderAgentMarkdown(el){
  var text=el&&el._rawText!=null?el._rawText:'';
  var target=el?el.querySelector('.c-text'):null;
  if(target)target.innerHTML=renderMarkdown(text);
}
function appendAgentChunk(el,chunk){
  if(!el)return;
  el._rawText=(el._rawText||'')+(chunk||'');
  renderAgentMarkdown(el);
}

// NAME OUTSIDE BUBBLE: c-msg-wrap contains name above + bubble below
function createLive(type,icon){
  var el=document.createElement('div');el.className='cmsg '+type;
  el._rawText='';
  el.innerHTML='<div class=\"c-avatar\">'+icon+'</div><div class=\"c-msg-wrap\"><div class=\"c-name\">'+(type==='oc'?'OpenClaw':'Hermes')+'</div><div class=\"c-bubble streaming\"><div class=\"c-text\"></div></div></div>';
  msgs.appendChild(el);hideWelcome();scroll();return el;
}
function addMsg(type,icon,text,meta){
  var el=document.createElement('div'),name=type==='oc'?'OpenClaw':type==='hm'?'Hermes':null;
  el.className='cmsg '+(type==='user'?'user':type);
  var avatarHtml=type==='user'?'':('<div class=\"c-avatar\">'+icon+'</div>');
  var nameHtml=name?'<div class=\"c-name\">'+name+'</div>':'';
  if(name&&meta&&meta.roleMode){
    var metaExecutor=displayExecutor(meta);
    var agentRole=metaExecutor===type?tr('agentRoleExecutor'):(meta.primary===type?tr('agentRoleSpeaker'):(meta.secondary===type?tr('agentRoleReviewer'):tr('agentRoleParticipant')));
    nameHtml+='<div class=\"c-meta\">'+esc(roleLabel(meta.roleMode))+(metaExecutor?' · '+esc(tr('turnExecutor'))+': '+esc(agentLabel(metaExecutor)):'')+' · '+esc(agentRole)+'</div>';
  }
  var bubbleHtml=(type==='oc'||type==='hm')?'<div class=\"c-bubble\"><div class=\"c-text\">'+renderMarkdown(text)+'</div></div>':'<div class=\"c-bubble\">'+esc(text).replace(/\n/g,'<br>')+'</div>';
  el.innerHTML=avatarHtml+'<div class=\"c-msg-wrap\">'+nameHtml+bubbleHtml+'</div>';
  msgs.appendChild(el);hideWelcome();scroll();
}
function sysMsg(text){var el=document.createElement('div');el.className='cmsg system';el.innerHTML='<div class=\"c-bubble\">'+esc(text)+'</div>';msgs.appendChild(el);scroll();}
function showThink(a,text){var el=document.createElement('div');el.className='cmsg system';el.id='think-'+a;el.innerHTML='<div class=\"c-bubble\">'+esc(text)+'<span class=\"dots\"><span>.</span><span>.</span><span>.</span></span></div>';msgs.appendChild(el);scroll();}
function hideThink(a){var el=document.getElementById('think-'+a);if(el){el.remove();}}
function markThinkError(a,text){var el=document.getElementById('think-'+a);if(el){el.className='cmsg system error';el.removeAttribute('id');var bubble=el.querySelector('.c-bubble');if(bubble)bubble.textContent=text;scroll();}else sysMsg(text);}
function hideWelcome(){var w=msgs.querySelector('.chat-welcome');if(w)w.style.display='none';}
function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML;}
function scroll(){requestAnimationFrame(function(){msgs.scrollTop=msgs.scrollHeight;});}

function agentLabel(a){if(a==='oc')return 'OpenClaw';if(a==='hm')return 'Hermes';if(a==='user')return tr('turnUser');return a||tr('turnNone');}
function fmtTime(ts){if(!ts)return '';try{return new Date(ts).toLocaleString(LANG==='zh'?'zh-CN':'en-US',{hour12:false});}catch(e){return '';}}
function fmtDuration(ms){ms=Number(ms||0);if(!ms)return '-';if(ms<1000)return ms+'ms';return (ms/1000).toFixed(ms<10000?1:0)+'s';}
function statusClass(s){return 'turn-status '+(s==='done'?'ok':s==='partial'||s==='needs-confirmation'||s==='blocked'?'warn':s==='error'||s==='rejected'||s==='cancelled'?'bad':'run');}
function eventDetails(e){var bits=[];if(e.reason)bits.push(e.reason);if(e.error)bits.push(e.error);if(e.mode)bits.push('mode: '+e.mode);if(e.scope)bits.push(tr('leaseScope')+': '+e.scope);if(e.claim)bits.push('claim: '+e.claim);if(e.expiresAt)bits.push(tr('leaseExpires')+': '+fmtTime(e.expiresAt));return bits.join(' · ');}

async function retryTurn(id){
  try{
    var r=await fetch('/api/turns/'+encodeURIComponent(id)+'/retry',{method:'POST'});
    var d=await r.json();if(!d.ok)throw new Error(d.error||'Retry failed');
    if($('role-mode'))$('role-mode').value=d.roleMode||'openclaw-main';
    inp.value=d.message||'';inp.dispatchEvent(new Event('input'));
    openPanel('chat');sysMsg(tr('retryPrepared'));
  }catch(e){sysMsg(e.message||String(e));}
}

async function continueTurn(id){
  try{
    var r=await fetch('/api/turns/'+encodeURIComponent(id)+'/continue',{method:'POST'});
    var d=await r.json();if(!d.ok)throw new Error(d.error||'Continue failed');
    if($('role-mode'))$('role-mode').value=d.roleMode||'openclaw-main';
    inp.value=d.message||'';inp.dispatchEvent(new Event('input'));
    openPanel('chat');sysMsg(tr('continuePrepared'));
  }catch(e){sysMsg(e.message||String(e));}
}

async function cancelTurn(id){
  try{
    var r=await fetch('/api/turns/'+encodeURIComponent(id)+'/cancel',{method:'POST'});
    var d=await r.json();if(!d.ok)throw new Error(d.error||'Cancel failed');
    selectedTurnId=id;await loadTurns();await loadTurnDetail(id);
  }catch(e){sysMsg(e.message||String(e));}
}

async function copyTurnUserMessage(id){
  try{
    var r=await fetch('/api/turns/'+encodeURIComponent(id));var d=await r.json();if(!d.ok)throw new Error(d.error||'Turn not found');
    var text=(d.turn&&d.turn.userMessage)||'';
    if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(text);
    else{inp.value=text;inp.dispatchEvent(new Event('input'));}
    sysMsg(tr('copied'));
  }catch(e){sysMsg(e.message||String(e));}
}

async function exportTurn(id){
  try{
    var r=await fetch('/api/turns/'+encodeURIComponent(id)+'/replay');
    var d=await r.json();if(!d.ok)throw new Error(d.error||'Export failed');
    var b=new Blob([d.markdown||''],{type:'text/markdown'});
    var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=d.filename||('dualmind-turn-'+id.slice(-8)+'.md');a.click();
  }catch(e){sysMsg(e.message||String(e));}
}

async function loadTurns(){
  var list=$('turns-list'),detail=$('turn-detail');if(!list||!detail)return;
  list.innerHTML='<div class=\"turn-empty\">...</div>';
  try{
    var params=new URLSearchParams({limit:'50'});
    var st=$('turn-filter-status'),src=$('turn-filter-source'),it=$('turn-filter-intent');
    if(st&&st.value)params.set('status',st.value);
    if(src&&src.value)params.set('source',src.value);
    if(it&&it.value)params.set('intent',it.value);
    var r=await fetch('/api/turns?'+params.toString());var d=await r.json();var turns=d.turns||[];
    if(!turns.length){list.innerHTML='<div class=\"turn-empty\">'+esc(tr('turnNoRecords'))+'</div>';detail.innerHTML='<div class=\"turn-empty\">'+esc(tr('turnEmpty'))+'</div>';return;}
    list.innerHTML=turns.map(function(t){
      var id=esc(t.id||'');
      var active=t.id===selectedTurnId?' active':'';
      var participants=[t.primary,t.secondary].filter(Boolean).map(agentLabel).join(' + ')||'-';
      return '<button class=\"turn-row'+active+'\" data-turn-id=\"'+id+'\">'
        +'<span class=\"'+statusClass(t.status)+'\">'+esc(t.status||'running')+'</span>'
        +'<strong>'+esc((t.id||'').slice(-6))+'</strong>'
        +'<span>'+esc(t.intent||'casual')+' · '+esc(t.roleMode||'')+'</span>'
        +'<small>'+esc(participants)+' · '+esc(fmtDuration(t.durationMs))+'</small>'
        +'</button>';
    }).join('');
    list.querySelectorAll('.turn-row').forEach(function(btn){btn.addEventListener('click',function(){selectedTurnId=this.dataset.turnId;loadTurnDetail(selectedTurnId);loadTurns();});});
    if(!selectedTurnId&&turns[0]){selectedTurnId=turns[0].id;loadTurnDetail(selectedTurnId);}
  }catch(e){
    list.innerHTML='<div class=\"turn-empty\">'+esc(e.message||String(e))+'</div>';
  }
}

async function loadTurnDetail(id){
  var detail=$('turn-detail');if(!detail||!id)return;
  detail.innerHTML='<div class=\"turn-empty\">...</div>';
  try{
    var r=await fetch('/api/turns/'+encodeURIComponent(id));var d=await r.json();if(!d.ok)throw new Error(d.error||'Turn not found');
    var t=d.turn, participants=[t.primary,t.secondary].filter(Boolean).map(agentLabel).join(' + ')||'-';
    var messages=(t.messages||[]).map(function(m){
      return '<div class=\"turn-msg\"><b>'+esc(agentLabel(m.agent))+'</b><span>'+esc(m.type||'message')+' · '+esc(fmtTime(m.ts))+'</span><p>'+esc(m.content||'').replace(/\n/g,'<br>')+'</p></div>';
    }).join('')||'<div class=\"turn-empty\">-</div>';
    var lease=t.actionLease||null;
    var leaseHtml=lease?('<h4>'+esc(tr('actionLease'))+'</h4><div class=\"turn-lease\">'
      +'<div><span>'+esc(tr('leaseOwner'))+'</span><b>'+esc(agentLabel(lease.owner||lease.agent))+'</b></div>'
      +'<div><span>'+esc(tr('turnIntent'))+'</span><b>'+esc(lease.intent||'-')+'</b></div>'
      +'<div><span>'+esc(tr('leaseStatus'))+'</span><b>'+esc(lease.status||'-')+'</b></div>'
      +'<div><span>'+esc(tr('leaseExpires'))+'</span><b>'+esc(fmtTime(lease.expiresAt)||'-')+'</b></div>'
      +'<div class=\"wide\"><span>'+esc(tr('leaseScope'))+'</span><b>'+esc(lease.scope||'-')+'</b></div>'
      +'</div>'):'';
    var warnings=(t.policyWarnings||[]).map(function(w){
      var claims=(w.claims||[]).map(function(c){return c.text;}).filter(Boolean).join(' · ');
      return '<div class=\"turn-warning\"><b>'+esc(agentLabel(w.agent))+'</b><span>'+esc(fmtTime(w.ts))+' · '+esc(w.reason||'')+'</span><p>'+esc(w.message||claims||'').replace(/\n/g,'<br>')+'</p>'+(claims?'<small>'+esc(claims)+'</small>':'')+'</div>';
    }).join('');
    var warningsHtml=warnings?('<h4>'+esc(tr('policyWarnings'))+'</h4>'+warnings):'';
    var statesObj=t.agentStates||{};
    var states=Object.keys(statesObj).map(function(agent){
      var s=statesObj[agent]||{};
      var detail=[s.streamingMode,s.error].filter(Boolean).join(' · ');
      return '<div class=\"turn-state\"><b>'+esc(agentLabel(agent))+'</b><span>'+esc(s.state||'idle')+' · '+esc(fmtTime(s.updatedAt))+'</span>'+(detail?'<p>'+esc(detail)+'</p>':'')+'</div>';
    }).join('');
    var statesHtml=states?('<h4>'+esc(tr('turnAgentStates'))+'</h4>'+states):'';
    var events=(t.events||[]).map(function(e){
      var details=eventDetails(e);
      return '<div class=\"turn-event\"><b>'+esc(e.type||'event')+'</b><span>'+esc(agentLabel(e.agent))+' · '+esc(fmtTime(e.ts))+'</span>'+(details?'<p>'+esc(details)+'</p>':'')+'</div>';
    }).join('')||'<div class=\"turn-empty\">-</div>';
    var canCancel=t.status==='running'||t.status==='needs-confirmation'||t.status==='queued';
    var canContinue=t.status==='queued';
    detail.innerHTML='<div class=\"turn-detail-head\">'
      +'<div><h3>'+esc((t.id||'').slice(-6))+'</h3><p>'+esc(t.id||'')+'</p></div>'
      +'<div class=\"turn-head-actions\"><span class=\"'+statusClass(t.status)+'\">'+esc(t.status||'running')+'</span>'
      +(canContinue?'<button class=\"btn-sec\" data-turn-continue=\"'+esc(t.id||'')+'\">'+esc(tr('continueTurn'))+'</button>':'')
      +'<button class=\"btn-sec\" data-turn-retry=\"'+esc(t.id||'')+'\">'+esc(tr('retryTurn'))+'</button>'
      +'<button class=\"btn-sec\" data-turn-export=\"'+esc(t.id||'')+'\">'+esc(tr('exportTurn'))+'</button>'
      +'<button class=\"btn-sec\" data-turn-copy=\"'+esc(t.id||'')+'\">'+esc(tr('copyUserMessage'))+'</button>'
      +(canCancel?'<button class=\"btn-sec\" data-turn-cancel=\"'+esc(t.id||'')+'\">'+esc(tr('cancelTurn'))+'</button>':'')
      +'</div>'
      +'</div>'
      +'<div class=\"turn-meta\">'
      +'<div><span>'+esc(tr('turnRoleMode'))+'</span><b>'+esc(t.roleMode||'-')+'</b></div>'
      +'<div><span>'+esc(tr('turnIntent'))+'</span><b>'+esc(t.intent||'-')+'</b></div>'
      +'<div><span>'+esc(tr('discussionStyle'))+'</span><b>'+esc(t.discussionPlan&&t.discussionPlan.style?tr('discussionStyle_'+t.discussionPlan.style):'-')+'</b></div>'
      +'<div><span>'+esc(tr('turnExecutor'))+'</span><b>'+esc(agentLabel(displayExecutor(t)))+'</b></div>'
      +'<div><span>'+esc(tr('turnParticipants'))+'</span><b>'+esc(participants)+'</b></div>'
      +'<div><span>'+esc(tr('turnSource'))+'</span><b>'+esc((t.source||'web')+(t.remoteUser?' · '+t.remoteUser:''))+'</b></div>'
      +'<div><span>'+esc(tr('taskId'))+'</span><b>'+esc(t.taskId||'-')+'</b></div>'
      +'<div><span>'+esc(tr('turnDuration'))+'</span><b>'+esc(fmtDuration(t.durationMs))+'</b></div>'
      +'<div><span>'+esc(tr('turnStatus'))+'</span><b>'+esc(t.status||'-')+'</b></div>'
      +'</div>'
      +leaseHtml
      +warningsHtml
      +statesHtml
      +'<h4>'+esc(tr('turnMessages'))+'</h4>'+messages
      +'<h4>'+esc(tr('turnEvents'))+'</h4>'+events;
    var retry=detail.querySelector('[data-turn-retry]');if(retry)retry.addEventListener('click',function(){retryTurn(this.dataset.turnRetry);});
    var cont=detail.querySelector('[data-turn-continue]');if(cont)cont.addEventListener('click',function(){continueTurn(this.dataset.turnContinue);});
    var exp=detail.querySelector('[data-turn-export]');if(exp)exp.addEventListener('click',function(){exportTurn(this.dataset.turnExport);});
    var copy=detail.querySelector('[data-turn-copy]');if(copy)copy.addEventListener('click',function(){copyTurnUserMessage(this.dataset.turnCopy);});
    var cancel=detail.querySelector('[data-turn-cancel]');if(cancel)cancel.addEventListener('click',function(){cancelTurn(this.dataset.turnCancel);});
  }catch(e){
    detail.innerHTML='<div class=\"turn-empty\">'+esc(e.message||String(e))+'</div>';
  }
}

$('clear-chat').addEventListener('click',async function(){msgs.querySelectorAll('.cmsg').forEach(function(e){e.remove()});msgs.innerHTML='<div class=\"chat-welcome\"><div class=\"chat-w-icon\"><img src=\"/oc-avatar.png\" class=\"w-avatar\"><img src=\"/hermes-avatar.png\" class=\"w-avatar\"></div><h3 data-i18n=\"welcomeTitle\"></h3><p data-i18n=\"welcomeMembers\"></p><p class=\"chat-w-hint\" data-i18n=\"welcomeHint\"></p></div>';applyLang();await fetch('/api/history/clear',{method:'POST'});});

if($('refresh-turns'))$('refresh-turns').addEventListener('click',loadTurns);
['turn-filter-status','turn-filter-source','turn-filter-intent'].forEach(function(id){var el=$(id);if(el)el.addEventListener('change',function(){selectedTurnId=null;loadTurns();});});
if($('lang-select'))$('lang-select').addEventListener('change',function(){LANG=this.value;localStorage.setItem('dualmind_lang',LANG);applyLang();ck();});
async function initApp(){await loadI18n();applyLang();await loadFromServer();ck();setInterval(ck,30000);}
initApp();
