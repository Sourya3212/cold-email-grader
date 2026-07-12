// ============================================================
// Cold Email Grader scoring engine.
// Single source of truth, shared by index.html (browser) and test.js (Node).
// The logic below is locked and copied verbatim from the verified build.
// ============================================================

const HIGH_SPAM_WORDS=["act now","buy now","order now","click here","apply now","call now","risk free","risk-free","100% free","100% satisfied","double your","earn money","make money","extra cash","cash bonus","money back","no cost","free access","free gift","free money","winner","you have been selected","you're a winner","congratulations you","limited time","act immediately","urgent","this is not spam","lowest price","best price","incredible deal","while supplies last","don't delete","dear friend","satisfaction guaranteed","guaranteed","once in a lifetime","last chance","don't miss","expires today","increase sales","increase traffic","work from home","be your own boss","no strings attached","no obligation","credit card","cheap","discount"];
const MED_SPAM_WORDS=["free trial","free","offer","deal","sale","promo","bonus","exclusive","instantly","amazing","opportunity","special","save big","save up to","% off","cash","income","profit","unlimited","miracle","trusted","risk","boost"];
const HOMOGLYPHS="\u0410\u0412\u0415\u041A\u041C\u041D\u041E\u0420\u0421\u0422\u0425\u0430\u0435\u043E\u0440\u0441\u0443\u0445\u0456\u0405\u0455\u0458\u04BB\u0391\u0392\u0395\u0396\u0397\u0399\u039A\u039C\u039D\u039F\u03A1\u03A4\u03A5\u03A7\u03B1\u03B5\u03B9\u03BA\u03BF\u03C1\u03C5\uFF41\uFF45\uFF4F\uFF50\uFF43";
const EMOJI_RE=/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F000}-\u{1F0FF}]/gu;
const SHORTENERS=["bit.ly","tinyurl.com","t.co","goo.gl","ow.ly","buff.ly","rebrand.ly","is.gd","cutt.ly","shorturl.at","rb.gy"];

function looksLikeHtml(s){return /<\s*(a|img|table|div|span|p|br|font|style|body|html|td|tr)[\s>\/]/i.test(s);}
function stripHtml(s){return s.replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&[a-z]+;/gi," ").replace(/\s+/g," ").trim();}

function analyze(subjectRaw, bodyRaw){
  const subject=(subjectRaw||"").trim();
  const bodyRawTrim=(bodyRaw||"").trim();
  const isHtml=looksLikeHtml(bodyRawTrim);
  const visible=isHtml?stripHtml(bodyRawTrim):bodyRawTrim;
  const haystack=(subject+" \n "+visible).toLowerCase();
  const words=visible?visible.split(/\s+/).filter(Boolean):[];
  const wordCount=words.length;
  const sentences=visible.split(/[.!?]+/).map(s=>s.trim()).filter(Boolean);
  const sentenceCount=Math.max(sentences.length,1);
  const findings=[]; let score=100;
  function penalize(pts,severity,title,fix,terms){const p=Math.round(pts); score-=p; findings.push({severity,title,fix,penalty:p,terms:terms||[]});}
  const pendingNotes=[]; function note(title,fix){pendingNotes.push({severity:"good",title,fix,penalty:0});}

  let hitHigh=[]; for(const w of HIGH_SPAM_WORDS) if(haystack.includes(w)) hitHigh.push(w);
  hitHigh=hitHigh.filter(w=>!hitHigh.some(o=>o!==w&&o.includes(w)));
  const hitMed=[]; for(const w of MED_SPAM_WORDS){ if(haystack.includes(w)&&!hitHigh.some(h=>h.includes(w))) hitMed.push(w); }
  let spamPenalty=hitHigh.length*5+hitMed.length*2.5; if(spamPenalty>30) spamPenalty=30;
  if(hitHigh.length||hitMed.length){
    const shown=[...hitHigh,...hitMed].slice(0,6); const tot=hitHigh.length+hitMed.length;
    const sev=hitHigh.length>=2?"high":"medium";
    penalize(spamPenalty,sev,`${tot} spam-trigger word${tot>1?"s":""} found`,
      `Filters keep running lists of sales-y words. Rewrite or cut these: ${shown.join(", ")}${tot>6?", and more":""}. Say the same thing in plain, specific language.`,
      [...hitHigh,...hitMed]);
  }

  const mergeRe=/(\{\{[^}]*\}\}|\[\[?[A-Za-z0-9_ .-]{2,}\]?\]|%[A-Za-z0-9_]+%|\*\|[^|]+\|\*|\$\{[^}]+\})/g;
  const merges=(subject+" "+visible).match(mergeRe);
  if(merges&&merges.length){
    penalize(15,"high","Unfilled personalization tag",
      `A merge field never got replaced (${merges.slice(0,3).join(", ")}). It tells the reader this was a mass blast, and tells filters the same thing. Fix the mail-merge mapping so every field fills.`,
      merges);
  }

  const homo=[]; for(const ch of (subject+visible)) if(HOMOGLYPHS.includes(ch)) homo.push(ch);
  if(homo.length){
    penalize(18,"high","Hidden lookalike characters",
      `Found ${homo.length} non-standard character${homo.length>1?"s":""} that mimic normal letters, for example a Cyrillic letter posing as a Latin one. This is a known filter-evasion trick, so filters hunt for it. Retype the affected words in plain English.`,
      homo);
  }

  if(isHtml){
    if(/font-size\s*:\s*0(px|pt)?/i.test(bodyRawTrim) || (/color\s*:\s*#?(fff(fff)?|white)/i.test(bodyRawTrim)&&/background\s*:\s*#?(fff(fff)?|white)/i.test(bodyRawTrim))){
      penalize(20,"high","Hidden or invisible text","There is text set to zero size or the same color as its background. Filters treat hidden text as deception and punish it hard. Remove it.");
    }
    const imgCount=(bodyRawTrim.match(/<img/gi)||[]).length;
    if(imgCount>=1&&wordCount<30){
      penalize(16,"high","Image-only email","Almost all of this email is image, with little real text. Image-only emails are a classic spam pattern, and they break for anyone who blocks images. Put your core message in actual text.");
    }
    const tagChars=(bodyRawTrim.match(/<[^>]+>/g)||[]).join("").length; const textChars=visible.length||1;
    if(tagChars/textChars>4&&wordCount>=30){
      penalize(8,"medium","Heavy, bloated HTML","There is far more markup than text here. Bloated HTML lowers your inbox odds. Simplify the layout, or send closer to plain text for cold outreach.");
    }
  }

  const urlRe=/(https?:\/\/[^\s"'<>)]+|www\.[^\s"'<>)]+)/gi;
  const urls=(bodyRawTrim.match(urlRe)||[]); const linkCount=urls.length;
  const shortenerUrls=urls.filter(u=>SHORTENERS.some(s=>u.toLowerCase().includes(s)));
  const usedShortener=shortenerUrls.length>0;
  if(usedShortener){ penalize(14,"high","Link shortener detected","A shortened link (like bit.ly) hides where it really goes, which is exactly what filters distrust. Use a full, branded link on your own domain.",shortenerUrls); }
  if(linkCount>=4){ penalize(Math.min(12,4+(linkCount-4)*2),"medium",`${linkCount} links in one email`,"Cold emails with a pile of links look promotional and land in spam or promotions. For a first touch, aim for one clear link, or none."); }
  else if(linkCount>sentenceCount&&linkCount>=2){ penalize(8,"medium","More links than message","You have more links than sentences. That ratio reads as promotional. Lead with a real message and keep links minimal."); }

  const capsWords=words.filter(w=>{const l=w.replace(/[^A-Za-z]/g,""); return l.length>=3&&l===l.toUpperCase()&&/[A-Z]/.test(l);});
  const capsRatio=wordCount?capsWords.length/wordCount:0;
  if(capsWords.length>=3&&capsRatio>0.06){ penalize(Math.min(12,4+capsWords.length*1.5),"medium","Too much SHOUTING",`${capsWords.length} words are in all caps. Caps read as shouting to people and as spam to filters. Use normal case and let the words carry the weight.`,capsWords); }

  const bangCount=(visible.match(/!/g)||[]).length; const streaks=(visible.match(/[!?]{2,}/g)||[]).length;
  if(bangCount>=3||streaks){ penalize(Math.min(10,bangCount*2+streaks*3),"medium","Excessive punctuation","Multiple exclamation marks (or !! and ?!) trip spam filters and read as hype. One exclamation mark, at most."); }
  if(/\${2,}|\$\d|\d+%\s*off|€\d|£\d/i.test(visible)){ penalize(6,"low","Money and discount symbols","Currency figures and percent-off phrasing lean promotional. Frame value in words rather than $$$ and %-off."); }

  if(wordCount===0){ penalize(0,"medium","No body text","Paste the email body to grade it."); }
  else if(wordCount<20){ penalize(10,"medium","Too thin to trust","This is very short. Ultra-short emails with a link look automated. Give a real reason for the message in two or three plain sentences."); }
  else if(wordCount>400){ penalize(6,"low","Very long for a cold email","This runs long for a first touch. Cut it toward 80 to 150 words so the ask is obvious in a few seconds."); }

  const hasUnsub=/(unsubscribe|opt[\s-]?out|stop receiving|manage.{0,15}preferences|no longer wish)/i.test(visible);
  if(!hasUnsub&&wordCount>=20){ penalize(8,"medium","No way to opt out","There is no unsubscribe or opt-out line. Any sending at scale needs one plus a real mailing address, both for the law and for your sender reputation. Add a plain unsubscribe link and a physical address in the footer."); }

  if(/\b(dear sir|dear madam|dear sir\/madam|to whom it may concern|dear friend|dear customer|dear user|dear valued)\b/i.test(haystack)){ penalize(6,"medium","Impersonal greeting",'Openings like "Dear Sir/Madam" or "Dear Friend" signal a blast and kill replies. Use the person\'s name, or at least their company.'); }

  const subjEmoji=(subject.match(EMOJI_RE)||[]).length; const bodyEmoji=(visible.match(EMOJI_RE)||[]).length;
  if(subjEmoji>=1||bodyEmoji>=3){ penalize(Math.min(6,subjEmoji*3+Math.max(0,bodyEmoji-2)),"low","Emoji in a cold email","Emoji in the subject or scattered through the body reads as marketing, especially B2B. Drop them for a first touch and it reads as a real person writing."); }

  if(subject){
    const sl=subject.replace(/[^A-Za-z]/g,"");
    if(sl.length>=4&&sl===sl.toUpperCase()){ penalize(12,"high","Subject is ALL CAPS","An all-caps subject is one of the loudest spam signals there is. Write it in normal sentence case."); }
    if(/^\s*(re|fwd?)\s*:/i.test(subject)){ penalize(12,"high",'Fake "Re:" or "Fwd:" subject','Starting a cold subject with "Re:" or "Fwd:" to fake a reply is a known trick, and filters and people both catch it. Write an honest subject.'); }
    if(subject.length>60){ penalize(3,"low","Subject may get cut off",`Your subject is ${subject.length} characters. Phones show roughly the first 40. Move the key words to the front and tighten it.`); }
    if((subject.match(/!/g)||[]).length>=1){ penalize(4,"low","Exclamation mark in subject","Exclamation marks in subjects lift spam scores. Cut it."); }
  } else {
    findings.push({severity:"good",title:"No subject provided",fix:"Add your subject line above to grade it too. The subject is the single biggest driver of opens.",penalty:0});
  }

  if(hasUnsub) note("Has an opt-out","Good. An easy unsubscribe protects your sender reputation.");
  if(wordCount>=40&&wordCount<=180&&linkCount<=1) note("Tight and focused","Good length and link count for a first touch.");
  if(!isHtml&&wordCount>=20) note("Sending as plain text","Plain text often out-delivers heavy HTML for cold outreach.");

  score=Math.max(0,Math.min(100,Math.round(score)));
  if(score>=50) for(const n of pendingNotes) findings.push(n);

  let grade,band;
  if(score>=85){grade="Inbox ready"; band="pass";}
  else if(score>=65){grade="Likely lands, with risk"; band="warn";}
  else if(score>=40){grade="Promotions or spam risk"; band="warn";}
  else {grade="Headed for spam"; band="fail";}

  const order={high:0,medium:1,low:2,good:3};
  findings.sort((a,b)=>order[a.severity]-order[b.severity]);
  return {score,grade,band,visible,stats:{wordCount,sentenceCount,linkCount,isHtml,capsWords:capsWords.length,bangCount},findings};
}

// ============================================================
// Environment exports.
// In the browser, attach the three functions the UI needs to window.
// Under Node, expose the same three via module.exports.
// ============================================================
if (typeof window !== "undefined") {
  window.analyze = analyze;
  window.looksLikeHtml = looksLikeHtml;
  window.stripHtml = stripHtml;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { analyze, looksLikeHtml, stripHtml };
}
