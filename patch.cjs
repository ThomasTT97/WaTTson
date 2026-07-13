const fs = require('fs');
const content = fs.readFileSync('App.tsx', 'utf8');

const targetContent = `                 {sortedTimelineItems.map((item, idx) => {
                    const prevItem = idx > 0 ? sortedTimelineItems[idx - 1] : null;
                    
                    const showFutureHeader = item.type === 'future_suggested' && (!prevItem || prevItem.type !== 'future_suggested');
                    const showTodayHeader = (item.type === 'today_suggested' || item.type === 'today_actual') && 
                                            (!prevItem || (prevItem.type !== 'today_suggested' && prevItem.type !== 'today_actual'));
                    const showPastHeader = item.type === 'past' && (!prevItem || prevItem.type !== 'past');

                    let showMonthHeader = false;
                    let monthLabel = '';
                    if (item.type === 'past' && item.activityData) {
                      const itemMonth = new Date(item.activityData.start_date_local).toLocaleString('default', { month: 'long', year: 'numeric' });
                      const prevMonth = prevItem && prevItem.activityData 
                        ? new Date(prevItem.activityData.start_date_local).toLocaleString('default', { month: 'long', year: 'numeric' })
                        : '';
                      if (itemMonth !== prevMonth) {
                        showMonthHeader = true;
                        monthLabel = itemMonth.toUpperCase();
                      }
                    }

                    return (
                      <React.Fragment key={item.key}>
                        {showFutureHeader && (
                          <div ref={todayElementRef} className="flex items-center gap-3 px-1 pt-4 pb-2 scroll-mt-24">
                            <span className="inline-block px-3 py-1 bg-blue-500 text-slate-950 text-[10px] font-black uppercase tracking-[0.25em] rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.4)]">
                              Plan
                            </span>
                            <div className="flex-1 h-px bg-gradient-to-r from-blue-500/40 to-transparent" />
                          </div>
                        )}

                        {showTodayHeader && (
                          <div 
                            ref={!sortedTimelineItems.some(i => i.type === 'future_suggested') ? todayElementRef : null} 
                            className="flex items-center gap-3 px-1 py-4 scroll-mt-24"
                          >
                            <span className="inline-block px-3 py-1 bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-[0.25em] rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.4)] animate-pulse">
                              Today
                            </span>
                            <div className="flex-1 h-px bg-gradient-to-r from-emerald-500/40 to-transparent" />
                          </div>
                        )}

                        {showPastHeader && (
                          <div className="flex items-center gap-3 px-1 pt-6 pb-2">
                            <span className="inline-block px-3 py-1 bg-[#12141c] border border-white/5 text-slate-400 text-[10px] font-black uppercase tracking-[0.25em] rounded-lg">
                              Training History
                            </span>
                            <div className="flex-1 h-px bg-gradient-to-r from-white/5 to-transparent" />
                          </div>
                        )}

                        {showMonthHeader && !showPastHeader && (
                          <div className="flex items-center gap-3 px-1 pt-6 pb-2">
                            <span className="inline-block px-3 py-1 bg-[#12141c] border border-white/5 text-slate-400 text-[10px] font-black uppercase tracking-[0.25em] rounded-lg">
                              {monthLabel}
                            </span>
                            <div className="flex-1 h-px bg-gradient-to-r from-white/5 to-transparent" />
                          </div>
                        )}

                        {item.type === 'past' || item.type === 'today_actual' ? (
                          item.activityData && (
                            <ActivityCard 
                              activity={item.activityData} 
                              onClick={setSelectedActivity} 
                            />
                          )
                        ) : (
                          item.dayData && (
                            <SuggestedWorkoutCard 
                              day={item.dayData}
                              absoluteIndex={item.absoluteIndex ?? 0}
                              onClick={(day) => setSelectedSuggestedDay(day)}
                              isToday={item.type === 'today_suggested'}
                            />
                          )
                        )}
                      </React.Fragment>
                    );
                  })}`;

const replacementContent = `                  {(() => {
                    const futureItems = sortedTimelineItems.filter(i => i.type === 'future_suggested');
                    const todayItems = sortedTimelineItems.filter(i => i.type === 'today_suggested' || i.type === 'today_actual');
                    const pastItems = sortedTimelineItems.filter(i => i.type === 'past');
                    
                    return (
                      <>
                        {/* Future Rides Section */}
                        {futureItems.length > 0 && (
                          <div className="flex flex-col space-y-3.5 relative">
                            <div className="sticky top-[68px] z-10 bg-slate-950/90 backdrop-blur-md pt-4 pb-2 px-1 -mx-1 border-b border-white/5">
                              <div className="flex items-center gap-3">
                                <span className="inline-block px-3 py-1 bg-blue-500 text-slate-950 text-[10px] font-black uppercase tracking-[0.25em] rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.4)]">
                                  Plan
                                </span>
                                <div className="flex-1 h-px bg-gradient-to-r from-blue-500/40 to-transparent" />
                              </div>
                            </div>
                            {futureItems.map((item, idx, arr) => (
                              <React.Fragment key={item.key}>
                                {item.dayData && (
                                  <div ref={idx === arr.length - 1 ? todayElementRef : null} className="scroll-mt-[112px]">
                                    <SuggestedWorkoutCard 
                                      day={item.dayData}
                                      absoluteIndex={item.absoluteIndex ?? 0}
                                      onClick={(day) => setSelectedSuggestedDay(day)}
                                      isToday={false}
                                    />
                                  </div>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        )}

                        {/* Today Section */}
                        {todayItems.length > 0 && (
                          <div className="flex flex-col space-y-3.5 pt-2">
                            <div 
                              className="flex items-center gap-3 px-1"
                              ref={futureItems.length === 0 ? todayElementRef : null}
                            >
                              <span className="inline-block px-3 py-1 bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-[0.25em] rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.4)] animate-pulse">
                                Today
                              </span>
                              <div className="flex-1 h-px bg-gradient-to-r from-emerald-500/40 to-transparent" />
                            </div>
                            {todayItems.map(item => (
                              <React.Fragment key={item.key}>
                                {item.type === 'today_actual' ? (
                                  item.activityData && (
                                    <ActivityCard 
                                      activity={item.activityData} 
                                      onClick={setSelectedActivity} 
                                    />
                                  )
                                ) : (
                                  item.dayData && (
                                    <div className="scroll-mt-[120px]">
                                      <SuggestedWorkoutCard 
                                        day={item.dayData}
                                        absoluteIndex={item.absoluteIndex ?? 0}
                                        onClick={(day) => setSelectedSuggestedDay(day)}
                                        isToday={true}
                                      />
                                    </div>
                                  )
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        )}

                        {/* Past Section */}
                        {pastItems.length > 0 && (
                          <div className="flex flex-col space-y-3.5 pt-4">
                            <div className="flex items-center gap-3 px-1 pb-2">
                              <span className="inline-block px-3 py-1 bg-[#12141c] border border-white/5 text-slate-400 text-[10px] font-black uppercase tracking-[0.25em] rounded-lg">
                                Training History
                              </span>
                              <div className="flex-1 h-px bg-gradient-to-r from-white/5 to-transparent" />
                            </div>
                            {pastItems.map((item, idx, arr) => {
                              const prevItem = idx > 0 ? arr[idx - 1] : null;
                              let showMonthHeader = false;
                              let monthLabel = '';
                              if (item.activityData) {
                                const itemMonth = new Date(item.activityData.start_date_local).toLocaleString('default', { month: 'long', year: 'numeric' });
                                const prevMonth = prevItem && prevItem.activityData 
                                  ? new Date(prevItem.activityData.start_date_local).toLocaleString('default', { month: 'long', year: 'numeric' })
                                  : '';
                                if (itemMonth !== prevMonth && idx > 0) { 
                                  showMonthHeader = true;
                                  monthLabel = itemMonth.toUpperCase();
                                }
                              }
                              
                              return (
                                <React.Fragment key={item.key}>
                                  {showMonthHeader && (
                                    <div className="flex items-center gap-3 px-1 pt-4 pb-2">
                                      <span className="inline-block px-3 py-1 bg-[#12141c] border border-white/5 text-slate-400 text-[10px] font-black uppercase tracking-[0.25em] rounded-lg">
                                        {monthLabel}
                                      </span>
                                      <div className="flex-1 h-px bg-gradient-to-r from-white/5 to-transparent" />
                                    </div>
                                  )}
                                  {item.activityData && (
                                    <ActivityCard 
                                      activity={item.activityData} 
                                      onClick={setSelectedActivity} 
                                    />
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}`;

if (content.includes(targetContent)) {
  fs.writeFileSync('App.tsx', content.replace(targetContent, replacementContent));
  console.log('Success!');
} else {
  console.log('Target content not found!');
  fs.writeFileSync('target_debug.txt', targetContent);
}
