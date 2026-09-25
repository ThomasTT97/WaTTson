const fs = require('fs');
const content = fs.readFileSync('App.tsx', 'utf8');

const target = `<div className="sticky top-[68px] z-10 bg-slate-950/90 backdrop-blur-md pt-4 pb-2 px-1 -mx-1 border-b border-white/5">`;
const replacement = `<div className="sticky top-[68px] z-10 bg-slate-950 pt-4 pb-2 px-1 -mx-1 border-b border-white/5 shadow-md">`;

if (content.includes(target)) {
  fs.writeFileSync('App.tsx', content.replace(target, replacement));
  console.log('Fixed Plan header background');
} else {
  console.log('Could not find Plan header');
}
