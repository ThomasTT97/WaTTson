const fs = require('fs');
const content = fs.readFileSync('App.tsx', 'utf8');

let newContent = content;

// Fix showWorkoutDetail
const workoutTarget = `                  {currentWorkout.workout_steps && currentWorkout.workout_steps.length > 0 ? (
                    currentWorkout.workout_steps.map((step, sIdx) => (
                      <div key={sIdx} className="flex flex-col gap-1 text-[13px] font-medium group">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 text-slate-300 min-w-0 flex-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] mt-1.5 flex-shrink-0" />
                            <div className="min-w-0 flex-1 text-left">
                              <StepLabel 
                                label={step.label}
                                target_pct={step.target_pct}
                                target_watts={step.target_watts}
                                currentFtp={ftp}
                                originalFtp={weeklyBriefing?.ftp}
                              />
                            </div>
                          </div>
                          {step.target_watts && (
                            <span className="text-emerald-400 font-extrabold uppercase tracking-wider text-[9px] bg-emerald-500/10 px-2 py-0.5 rounded flex-shrink-0 italic">
                              {getStepPhaseLabel(sIdx, currentWorkout.workout_steps?.length || 0, step.label)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                     <p className="text-[14px] text-slate-400 leading-relaxed italic text-center px-4 font-medium opacity-80">
                       {currentWorkout.description}
                     </p>
                  )}`;

const workoutReplacement = `                  {currentWorkout.workout_steps && currentWorkout.workout_steps.length > 0 ? (
                    <GroupedWorkoutStepsList 
                      steps={currentWorkout.workout_steps}
                      currentFtp={ftp || undefined}
                      originalFtp={weeklyBriefing?.ftp}
                      fontSize="base"
                    />
                  ) : (
                     <p className="text-[14px] text-slate-400 leading-relaxed italic text-center px-4 font-medium opacity-80">
                       {currentWorkout.description}
                     </p>
                  )}`;

if (newContent.includes(workoutTarget)) {
  newContent = newContent.replace(workoutTarget, workoutReplacement);
  console.log('Fixed showWorkoutDetail');
} else {
  console.log('Could not find showWorkoutDetail target');
}

// Fix showSuggestionDetail target
const suggestionTarget = `              <h3 className="text-2xl font-black text-white italic tracking-tighter mb-1.5 uppercase text-center leading-tight">
                {hasRideToday ? "(TOMORROW'S) " : "(TODAY'S) "} {currentWorkout?.title.toUpperCase()}
              </h3>
              <p className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.25em] mb-8 text-center">{suggestion.reasoning.slice(0, 50)}...</p>
                
              <div className="bg-[#0a0c10] p-6 rounded-[2.5rem] border border-white/5 w-full text-left space-y-5 shadow-inner relative overflow-hidden">`;

const suggestionReplacement = `              <h3 className="text-2xl font-black text-white italic tracking-tighter mb-8 uppercase text-center leading-tight">
                {hasRideToday ? "(TOMORROW'S) " : "(TODAY'S) "} {currentWorkout?.title.toUpperCase()}
              </h3>
                
              <div className="bg-[#0a0c10] p-6 rounded-[2.5rem] border border-white/5 w-full text-left space-y-5 shadow-inner relative overflow-hidden">`;

if (newContent.includes(suggestionTarget)) {
  newContent = newContent.replace(suggestionTarget, suggestionReplacement);
  console.log('Fixed suggestionTarget');
} else {
  console.log('Could not find suggestionTarget');
}

const suggestionStepsTarget = `                  {currentWorkout?.workout_steps && currentWorkout.workout_steps.length > 0 ? (
                    currentWorkout.workout_steps.map((step, sIdx) => (
                      <div key={sIdx} className="flex flex-col gap-1 text-[13px] font-medium group">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 text-slate-300 min-w-0 flex-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] mt-1.5 flex-shrink-0" />
                            <div className="min-w-0 flex-1 text-left">
                              <StepLabel 
                                label={step.label}
                                target_pct={step.target_pct}
                                target_watts={step.target_watts}
                                currentFtp={ftp}
                                originalFtp={weeklyBriefing?.ftp}
                              />
                            </div>
                          </div>
                          {step.target_watts && (
                            <span className="text-emerald-400 font-extrabold uppercase tracking-wider text-[9px] bg-emerald-500/10 px-2 py-0.5 rounded flex-shrink-0 italic">
                              {getStepPhaseLabel(sIdx, currentWorkout.workout_steps?.length || 0, step.label)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                     <p className="text-[13px] text-slate-400 leading-relaxed italic text-center px-4 font-medium opacity-80">
                       {suggestion.reasoning}
                     </p>
                  )}`;

const suggestionStepsReplacement = `                  {currentWorkout?.workout_steps && currentWorkout.workout_steps.length > 0 ? (
                    <GroupedWorkoutStepsList 
                      steps={currentWorkout.workout_steps}
                      currentFtp={ftp || undefined}
                      originalFtp={weeklyBriefing?.ftp}
                      fontSize="sm"
                    />
                  ) : (
                     <p className="text-[13px] text-slate-400 leading-relaxed italic text-center px-4 font-medium opacity-80">
                       {suggestion.reasoning}
                     </p>
                  )}`;

if (newContent.includes(suggestionStepsTarget)) {
  newContent = newContent.replace(suggestionStepsTarget, suggestionStepsReplacement);
  console.log('Fixed suggestionStepsTarget');
} else {
  console.log('Could not find suggestionStepsTarget');
}

fs.writeFileSync('App.tsx', newContent);
