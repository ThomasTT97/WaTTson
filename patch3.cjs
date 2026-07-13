const fs = require('fs');
const content = fs.readFileSync('App.tsx', 'utf8');

let newContent = content;

const suggestionTarget = `              <h3 className="text-2xl font-black text-white italic tracking-tighter mb-1.5 uppercase text-center leading-tight">
                {hasRideToday ? "(TOMORROW'S) " : "(TODAY'S) "} {currentWorkout?.title.toUpperCase()}
              </h3>
              <p className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.25em] mb-8 text-center">{suggestion.reasoning.slice(0, 50)}...</p>`;

const suggestionReplacement = `              <h3 className="text-2xl font-black text-white italic tracking-tighter mb-8 uppercase text-center leading-tight">
                {hasRideToday ? "(TOMORROW'S) " : "(TODAY'S) "} {currentWorkout?.title.toUpperCase()}
              </h3>`;

if (newContent.includes(suggestionTarget)) {
  newContent = newContent.replace(suggestionTarget, suggestionReplacement);
  console.log('Fixed suggestionTarget');
} else {
  console.log('Could not find suggestionTarget');
}

fs.writeFileSync('App.tsx', newContent);
