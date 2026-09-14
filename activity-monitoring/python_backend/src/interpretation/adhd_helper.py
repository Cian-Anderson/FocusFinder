from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
from ..database.schema import ActivityLog, ADHDInsights, UserSettings

class ADHDHelper:
    def __init__(self, db_manager, logger):
        self.db_manager = db_manager
        self.logger = logger
        self._ensure_user_settings()
    
    # Ensure user settings row exists
    def _ensure_user_settings(self):
        settings = self.db_manager.session.query(UserSettings).filter(UserSettings.id == 1).first()
        if not settings:
            settings = UserSettings(
                id=1,
                medication_enabled=0,
                hyperfocus_warning_hours=2.5,
                break_reminder_minutes=45,
                rapid_switch_threshold=15,
                day_start_hour=6,
                created_at=datetime.now(),
                last_updated=datetime.now()
            )
            self.db_manager.session.add(settings)
            self.db_manager.session.commit()
    
    # Detect if user has been in focused apps for too long without breaks. Returns warning if detected.
    def detect_hyperfocus(self) -> Optional[Dict]:
        settings = self.db_manager.session.query(UserSettings).filter(UserSettings.id == 1).first()
        threshold_hours = settings.hyperfocus_warning_hours
        
        cutoff_time = datetime.now() - timedelta(hours=threshold_hours)
        
        # Get activities in the threshold window
        activities = self.db_manager.session.query(ActivityLog)\
            .filter(ActivityLog.timestamp >= cutoff_time)\
            .filter(ActivityLog.classification == 'focused')\
            .all()
        
        if not activities:
            return None
        
        # Calculate percentage of time spent focused
        total_intervals = (threshold_hours * 3600) / 30  # 30-second intervals
        focused_intervals = len(activities)
        focus_percentage = (focused_intervals / total_intervals) * 100
        
        # If 85%+ focused for threshold hours, warn about hyperfocus
        if focus_percentage >= 85:
            hours = threshold_hours
            self.logger.log(f"WARNING: Hyperfocus detected: {hours}+ hours of continuous focus")
            
            return {
                'detected': True,
                'duration_hours': hours,
                'focus_percentage': round(focus_percentage, 1),
                'message': f"You've been hyperfocused for {hours}+ hours! Time for water/food/stretch?"
            }
        
        return None
    
    # Detect if user is switching apps too rapidly (sign of overwhelm/avoidance).
    def detect_rapid_switching(self, window_minutes: int = 5) -> Optional[Dict]:
        settings = self.db_manager.session.query(UserSettings).filter(UserSettings.id == 1).first()
        threshold = settings.rapid_switch_threshold
        
        cutoff_time = datetime.now() - timedelta(minutes=window_minutes)
        
        # Get recent activities
        activities = self.db_manager.session.query(ActivityLog)\
            .filter(ActivityLog.timestamp >= cutoff_time)\
            .order_by(ActivityLog.timestamp.asc())\
            .all()
        
        if len(activities) < 2:
            return None
        
        # Count app switches
        switches = 0
        for i in range(1, len(activities)):
            if activities[i].app_name != activities[i-1].app_name:
                switches += 1
        
        switches_per_minute = switches / window_minutes
        
        if switches >= threshold:
            self.logger.log(f"WARNING: Rapid switching detected: {switches} switches in {window_minutes} min")
            
            return {
                'detected': True,
                'switches': switches,
                'switches_per_minute': round(switches_per_minute, 1),
                'message': f"{switches} app switches in {window_minutes} minutes. Feeling overwhelmed? Try focusing on one task."
            }
        
        return None
    
    # Check how long since last break (neutral activity or high idle time).
    def check_time_since_last_break(self) -> Dict:
        settings = self.db_manager.session.query(UserSettings).filter(UserSettings.id == 1).first()
        break_reminder_minutes = settings.break_reminder_minutes
        
        # Find last "break" (neutral classification or idle > 2 min)
        recent_activities = self.db_manager.session.query(ActivityLog)\
            .order_by(ActivityLog.timestamp.desc())\
            .limit(100)\
            .all()
        
        last_break_time = None
        for activity in reversed(recent_activities):
            if activity.classification == 'neutral' or (activity.idle_time or 0) > 120:
                last_break_time = activity.timestamp
                break
        
        if last_break_time:
            time_since_break = (datetime.now() - last_break_time).total_seconds() / 60
            
            if time_since_break >= break_reminder_minutes:
                return {
                    'needs_break': True,
                    'minutes_since_break': round(time_since_break),
                    'message': f"It's been {round(time_since_break)} minutes. Time for a quick break!"
                }
        
        return {'needs_break': False}
    
    def classify_distraction_severity(self, duration_seconds: int) -> str:
        """
        Classify distraction based on duration.
        < 2 min = micro_break (healthy!)
        2-10 min = minor_distraction
        > 10 min = major_distraction
        """
        if duration_seconds < 120:
            return "micro_break"
        elif duration_seconds < 600:
            return "minor_distraction"
        else:
            return "major_distraction"
    
    def adjust_classification_for_time_of_day(self, classification: str, timestamp: datetime) -> str:
        """
        Adjust classification based on ADHD-friendly time-of-day patterns.
        """
        hour = timestamp.hour
        
        # Morning grace period (6-9am) - brain fog is normal
        if 6 <= hour < 9:
            if classification == 'distracted':
                self.logger.log(f"Morning brain fog detected at {hour}:00 - being lenient")
                return 'neutral'
        
        # Afternoon dip (2-4pm) - energy crash is normal
        if 14 <= hour < 16:
            if classification == 'distracted':
                self.logger.log(f"Afternoon ADHD energy dip at {hour}:00 - normal pattern")
                # Don't change classification, just log it
        
        return classification
    
    def detect_task_avoidance_pattern(self, window_minutes: int = 15) -> Optional[Dict]:
        """
        Detect task avoidance pattern:
        Distracted → Brief neutral → Distracted → Brief neutral (loop)
        """
        cutoff_time = datetime.now() - timedelta(minutes=window_minutes)
        
        activities = self.db_manager.session.query(ActivityLog)\
            .filter(ActivityLog.timestamp >= cutoff_time)\
            .filter(ActivityLog.classification != None)\
            .order_by(ActivityLog.timestamp.asc())\
            .all()
        
        if len(activities) < 4:
            return None
        
        # Look for alternating distracted/neutral pattern
        pattern_detected = False
        alternations = 0
        
        for i in range(len(activities) - 1):
            curr = activities[i].classification
            next_class = activities[i + 1].classification
            
            if (curr == 'distracted' and next_class == 'neutral') or \
               (curr == 'neutral' and next_class == 'distracted'):
                alternations += 1
        
        # If 60%+ of transitions are distracted/neutral alternations
        if alternations / (len(activities) - 1) > 0.6:
            pattern_detected = True
        
        if pattern_detected:
            self.logger.log("WARNING: Task avoidance pattern detected")
            return {
                'detected': True,
                'message': "Struggling to start? Try just 2 minutes of work - that's it!"
            }
        
        return None
    
    def is_medication_active(self) -> bool:
        """
        Check if ADHD medication should be active now (if tracking enabled).
        """
        settings = self.db_manager.session.query(UserSettings).filter(UserSettings.id == 1).first()
        
        if not settings.medication_enabled:
            return False
        
        if not settings.medication_times:
            return False
        
        try:
            import json
            med_times = json.loads(settings.medication_times)
            now = datetime.now()
            current_time = now.time()
            
            for med_time_str in med_times:
                med_hour, med_minute = map(int, med_time_str.split(':'))
                med_datetime = datetime.combine(now.date(), datetime.min.time().replace(hour=med_hour, minute=med_minute))
                
                # Check if within active window
                time_since_dose = (now - med_datetime).total_seconds() / 3600
                if 0 <= time_since_dose <= settings.medication_duration_hours:
                    return True
            
            return False
        except:
            return False
    
    def update_daily_adhd_insights(self) -> None:
        """
        Update the ADHDInsights table with today's patterns.
        """
        from datetime import date
        today = date.today()
        
        # Get or create today's insights
        insights = self.db_manager.session.query(ADHDInsights).filter(ADHDInsights.date == today).first()
        now = datetime.now()
        
        if not insights:
            insights = ADHDInsights(
                date=today,
                created_at=now,
                last_updated=now
            )
            self.db_manager.session.add(insights)
        
        # Calculate time-of-day focus scores
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())
        
        for period_name, start_hour, end_hour in [
            ('morning', 6, 10),
            ('midday', 10, 14),
            ('afternoon', 14, 18),
            ('evening', 18, 23)  # Changed from 24 to 23
        ]:
            try:
                period_start = today_start.replace(hour=start_hour, minute=0, second=0, microsecond=0)
                period_end = today_start.replace(hour=end_hour, minute=59, second=59, microsecond=999999)
                
                activities = self.db_manager.session.query(ActivityLog)\
                    .filter(ActivityLog.timestamp >= period_start)\
                    .filter(ActivityLog.timestamp <= period_end)\
                    .filter(ActivityLog.classification != None)\
                    .all()
                
                if activities:
                    focused = sum(1 for a in activities if a.classification == 'focused')
                    score = (focused / len(activities)) * 100
                    
                    if period_name == 'morning':
                        insights.morning_focus_score = round(score, 2)
                    elif period_name == 'midday':
                        insights.midday_focus_score = round(score, 2)
                    elif period_name == 'afternoon':
                        insights.afternoon_focus_score = round(score, 2)
                    elif period_name == 'evening':
                        insights.evening_focus_score = round(score, 2)
            
            except Exception as e:
                self.logger.log_error(f"Error calculating {period_name} focus score: {e}")
                continue
        
        insights.last_updated = now
        
        try:
            self.db_manager.session.commit()
            self.logger.log("Updated ADHD insights")
        except Exception as e:
            self.db_manager.session.rollback()
            self.logger.log_error(f"Error committing ADHD insights: {e}")