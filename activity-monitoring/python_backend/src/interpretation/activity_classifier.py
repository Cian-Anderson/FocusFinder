from typing import Optional, Dict, List
from datetime import datetime

class ActivityClassifier:
    # Initialize the Activity Classifier with db_manager and logger.
    def __init__(self, db_manager, logger):
        self.db_manager = db_manager
        self.logger = logger
        
        # Import ADHD helper
        from .adhd_helper import ADHDHelper
        self.adhd_helper = ADHDHelper(db_manager, logger)
        
        # Define productive/focused applications
        self.focused_apps = {
            'Visual Studio Code', 'PyCharm', 'IntelliJ IDEA', 'Eclipse', 'NetBeans',
            'Sublime Text', 'Atom', 'Notepad++', 'vim', 'emacs', 'Visual Studio',
            'Android Studio', 'Xcode', 'WebStorm', 'PhpStorm', 'RubyMine',
            'CLion', 'DataGrip', 'GoLand', 'Rider', 'AppCode',
            
            # === OFFICE & PRODUCTIVITY SUITES ===
            'Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Microsoft Access',
            'Microsoft Outlook', 'Microsoft OneNote', 'Microsoft Publisher', 'Microsoft Project',
            'Google Docs', 'Google Sheets', 'Google Slides', 'Google Forms',
            'LibreOffice Writer', 'LibreOffice Calc', 'LibreOffice Impress',
            'Apache OpenOffice', 'WPS Office', 'Apple Pages', 'Apple Numbers', 'Apple Keynote',
            'Notion', 'Evernote', 'OneNote', 'Obsidian', 'Roam Research',
            
            # === DESIGN & CREATIVE TOOLS ===
            'Adobe Photoshop', 'Adobe Illustrator', 'Adobe InDesign', 'Adobe XD',
            'Adobe Premiere Pro', 'Adobe After Effects', 'Adobe Lightroom', 'Adobe Acrobat',
            'Figma', 'Sketch', 'Affinity Designer', 'Affinity Photo', 'Affinity Publisher',
            'CorelDRAW', 'GIMP', 'Inkscape', 'Krita', 'Paint.NET',
            'Blender', 'Maya', 'Cinema 4D', '3ds Max', 'ZBrush', 'Houdini',
            'DaVinci Resolve', 'Final Cut Pro', 'Avid Media Composer',
            'Canva', 'Procreate', 'Clip Studio Paint',
            
            # === DATA ANALYSIS & SCIENTIFIC ===
            'MATLAB', 'RStudio', 'Jupyter', 'Spyder', 'Anaconda',
            'Tableau', 'Power BI', 'Qlik', 'Looker',
            'SPSS', 'SAS', 'Stata', 'Minitab', 'Origin',
            'LabVIEW', 'Mathematica', 'Maple', 'GNU Octave',
            
            # === CAD & ENGINEERING ===
            'AutoCAD', 'SolidWorks', 'CATIA', 'Fusion 360', 'Inventor',
            'Revit', 'SketchUp', 'Rhino', 'ArchiCAD', 'Civil 3D',
            'ANSYS', 'COMSOL', 'Altium Designer', 'Eagle', 'KiCad',
            
            # === BUSINESS & PROJECT MANAGEMENT ===
            'SAP', 'Oracle', 'Salesforce', 'Dynamics', 'Workday',
            'Jira', 'Asana', 'Trello', 'Monday.com', 'ClickUp', 'Basecamp',
            'Microsoft Teams', 'Slack', 'Zoom', 'Google Meet', 'Webex',
            
            # === WRITING & DOCUMENTATION ===
            'Scrivener', 'Ulysses', 'Bear', 'iA Writer', 'Typora',
            'Overleaf', 'TeXstudio', 'LyX', 'MiKTeX',
            'Grammarly', 'ProWritingAid', 'Hemingway Editor',
            
            # === AUDIO & MUSIC PRODUCTION ===
            'Ableton Live', 'FL Studio', 'Logic Pro', 'Pro Tools', 'Cubase',
            'Studio One', 'Reaper', 'GarageBand', 'Audacity', 'Adobe Audition',
            
            # === DATABASE & SERVER TOOLS ===
            'MySQL Workbench', 'pgAdmin', 'SQL Server Management Studio',
            'DBeaver', 'DbVisualizer', 'Navicat', 'HeidiSQL',
            'Postman', 'Insomnia', 'Swagger', 'Docker', 'Kubernetes',
            
            # === FINANCIAL & ACCOUNTING ===
            'QuickBooks', 'Xero', 'FreshBooks', 'Sage', 'Wave',
            'TurboTax', 'H&R Block', 'TaxAct',
            'Bloomberg Terminal', 'MetaTrader', 'TradingView',
            
            # === LEGAL ===
            'Clio', 'MyCase', 'PracticePanther', 'Smokeball', 'LexisNexis',
            
            # === EDUCATION & LEARNING PLATFORMS ===
            'Canvas', 'Blackboard', 'Moodle', 'Schoology', 'Google Classroom',
            'Coursera', 'edX', 'Udemy', 'LinkedIn Learning', 'Skillshare',
            'Khan Academy', 'Duolingo', 'Rosetta Stone', 'Anki', 'Quizlet',
            
            # === READING & RESEARCH ===
            'Zotero', 'Mendeley', 'EndNote', 'ReadCube', 'Paperpile',
            'Kindle', 'Adobe Digital Editions', 'Calibre',
            
            # === TERMINALS & COMMAND LINE ===
            'Terminal', 'iTerm', 'Command Prompt', 'PowerShell', 'Windows Terminal',
            'Git Bash', 'Hyper', 'Alacritty', 'Terminator', 'Konsole',
            
            # === VERSION CONTROL & DEVOPS ===
            'GitHub Desktop', 'GitKraken', 'Sourcetree', 'Tower',
            'Jenkins', 'GitLab', 'Bitbucket', 'Azure DevOps',
        }
        
        # DISTRACTED APPLICATIONS - Entertainment & Social Media
        self.distracted_apps = {
            # === SOCIAL MEDIA ===
            'Facebook', 'Twitter', 'Instagram', 'TikTok', 'Snapchat',
            'LinkedIn', 'Pinterest', 'Tumblr', 'Reddit', 'WhatsApp',
            'Telegram', 'Signal', 'Messenger', 'WeChat', 'Line',
            'Discord', 'Mastodon', 'Threads', 'BeReal',
            
            # === VIDEO STREAMING ===
            'YouTube', 'Netflix', 'Hulu', 'Disney+', 'Prime Video',
            'HBO Max', 'Apple TV', 'Paramount+', 'Peacock', 'Crunchyroll',
            'Twitch', 'Vimeo', 'Dailymotion',
            
            # === MUSIC STREAMING (when used for entertainment) ===
            'Spotify', 'Apple Music', 'YouTube Music', 'SoundCloud',
            'Pandora', 'Tidal', 'Deezer', 'Amazon Music',
            
            # === GAMING PLATFORMS ===
            'Steam', 'Epic Games', 'Origin', 'Uplay', 'Battle.net',
            'GOG Galaxy', 'Xbox', 'PlayStation', 'Nintendo',
            'League of Legends', 'Fortnite', 'Minecraft', 'Roblox',
            'Valorant', 'Counter-Strike', 'Dota', 'Overwatch',
            'Call of Duty', 'Apex Legends', 'World of Warcraft',
            'GTA', 'FIFA', 'NBA 2K', 'Madden', 'Rocket League',
            
            # === SHOPPING & E-COMMERCE ===
            'Amazon', 'eBay', 'Etsy', 'AliExpress', 'Wish',
            'ASOS', 'Shein', 'Zara', 'H&M', 'Target', 'Walmart',
            
            # === NEWS & TABLOIDS (casual browsing) ===
            'BuzzFeed', 'TMZ', 'Daily Mail', 'Huffington Post',
            '9GAG', 'Imgur', 'iFunny', 'Cheezburger',
            
            # === DATING APPS ===
            'Tinder', 'Bumble', 'Hinge', 'OkCupid', 'Match',
            'Plenty of Fish', 'Grindr', 'Her',
            
            # === GAMBLING & BETTING ===
            'PokerStars', 'Bet365', 'DraftKings', 'FanDuel',
        }
        
        # NEUTRAL APPLICATIONS - System/Utilities/Ambiguous
        self.neutral_apps = {
            # === SYSTEM UTILITIES ===
            'File Explorer', 'Windows Explorer', 'Finder', 'Nautilus',
            'Settings', 'System Preferences', 'Control Panel',
            'Task Manager', 'Activity Monitor', 'Resource Monitor',
            'Registry Editor', 'Disk Utility', 'Device Manager',
            
            # === BASIC TOOLS ===
            'Calculator', 'Notepad', 'TextEdit', 'WordPad',
            'Sticky Notes', 'Reminders', 'Calendar', 'Clock',
            'Weather', 'Maps', 'Contacts', 'Phone',
            
            # === FILE MANAGEMENT ===
            'WinRAR', '7-Zip', 'WinZip', 'PeaZip',
            'Dropbox', 'Google Drive', 'OneDrive', 'iCloud',
            'Box', 'Mega', 'pCloud', 'Sync.com',
            
            # === SYSTEM MONITORS ===
            'MSI Afterburner', 'CPU-Z', 'GPU-Z', 'HWMonitor',
            'Speccy', 'CrystalDiskInfo', 'HWiNFO',
            
            # === BROWSERS (classified separately by content) ===
            'Google Chrome', 'Mozilla Firefox', 'Microsoft Edge', 'Safari',
            'Opera', 'Brave', 'Vivaldi', 'Arc', 'DuckDuckGo',
            
            # === EMAIL CLIENTS (could be work or personal) ===
            'Thunderbird', 'Apple Mail', 'Outlook', 'Mailbird',
            'Spark', 'Airmail', 'eM Client',
            
            # === COMMUNICATION (ambiguous - could be work or social) ===
            'Skype', 'FaceTime', 'Google Hangouts', 'Microsoft Teams',
            
            # === MEDIA PLAYERS ===
            'VLC', 'Windows Media Player', 'QuickTime', 'iTunes',
            'MPC-HC', 'PotPlayer', 'Kodi', 'Plex',
            
            # === PDF READERS ===
            'Adobe Acrobat Reader', 'Foxit Reader', 'Sumatra PDF',
            'PDF Expert', 'Preview', 'Kami',
            
            # === SECURITY & ANTIVIRUS ===
            'Windows Defender', 'Norton', 'McAfee', 'Avast', 'AVG',
            'Malwarebytes', 'Bitdefender', 'Kaspersky',
            
            # === VPN & NETWORK ===
            'NordVPN', 'ExpressVPN', 'CyberGhost', 'ProtonVPN',
            'Wireshark', 'PuTTY', 'FileZilla', 'WinSCP',
            
            # === LAUNCHERS & UTILITIES ===
            'Alfred', 'Spotlight', 'Start Menu', 'Launchpad',
            'Rainmeter', 'Wallpaper Engine', 'f.lux', 'Flux',
        }

    def classify_activity(self, activity_record: Dict) -> str:
        """
        Classify an activity event as 'focused', 'neutral', or 'distracted'.
        Now includes ADHD-aware time-of-day adjustments.
        
        Args:
            activity_record: Dict containing app_name, window_title, timestamp
            
        Returns:
            Classification string: 'focused', 'neutral', or 'distracted'
        """
        app_name = activity_record.get('app_name', '').strip()
        window_title = activity_record.get('window_title', '').lower()
        timestamp_str = activity_record.get('timestamp')
        
        # Parse timestamp
        try:
            timestamp = datetime.fromisoformat(timestamp_str)
        except:
            timestamp = datetime.now()
        
        # Rule 1: Check for NoActiveWindow or empty app
        if app_name in ['NoActiveWindow', 'Unknown', ''] or not app_name:
            return 'neutral'
        
        # Rule 2: Check against focused apps
        if self._is_focused_app(app_name, window_title):
            base_classification = 'focused'
        # Rule 3: Check against distracted apps
        elif self._is_distracted_app(app_name, window_title):
            base_classification = 'distracted'
        # Rule 4: Check against neutral apps
        elif self._is_neutral_app(app_name):
            base_classification = 'neutral'
        # Rule 5: Browser heuristics
        elif self._is_browser(app_name):
            base_classification = self._classify_browser_activity(window_title)
        else:
            base_classification = 'neutral'
        
        # ADHD-aware: Adjust for time of day
        adjusted_classification = self.adhd_helper.adjust_classification_for_time_of_day(
            base_classification, 
            timestamp
        )
        
        return adjusted_classification

    def _is_browser(self, app_name: str) -> bool:
        """Check if the application is a web browser."""
        browsers = ['chrome', 'firefox', 'edge', 'safari', 'opera', 'brave', 'vivaldi', 'arc']
        return any(browser in app_name.lower() for browser in browsers)

    def _is_focused_app(self, app_name: str, window_title: str) -> bool:
        """Check if the application is in the focused category."""
        for focused in self.focused_apps:
            if focused.lower() in app_name.lower():
                return True
        
        productive_keywords = [
            'document', 'spreadsheet', 'presentation', 'report', 'assignment',
            'thesis', 'dissertation', 'paper', 'essay', 'proposal',
            'code', 'editor', 'ide', 'compiler', 'debugger',
            'design', 'diagram', 'blueprint', 'schematic', 'drawing',
            'analysis', 'data', 'statistics', 'research', 'study'
        ]
        for keyword in productive_keywords:
            if keyword in window_title:
                return True
        
        return False

    def _is_distracted_app(self, app_name: str, window_title: str) -> bool:
        """Check if the application is in the distracted category."""
        for distracted in self.distracted_apps:
            if distracted.lower() in app_name.lower():
                return True
        
        entertainment_keywords = [
            'youtube', 'netflix', 'hulu', 'disney', 'twitch', 'stream',
            'game', 'gaming', 'play', 'level', 'score',
            'facebook', 'instagram', 'twitter', 'tiktok', 'snapchat',
            'meme', 'funny', 'viral', 'trending',
            'shopping', 'cart', 'checkout', 'buy now',
            'dating', 'match', 'swipe'
        ]
        for keyword in entertainment_keywords:
            if keyword in window_title:
                return True
        
        return False

    def _is_neutral_app(self, app_name: str) -> bool:
        """Check if the application is in the neutral category."""
        for neutral in self.neutral_apps:
            if neutral.lower() in app_name.lower():
                return True
        return False

    def _classify_browser_activity(self, window_title: str) -> str:
        """Classify browser activity based on the tab title/URL."""
        focused_keywords = [
            'stackoverflow', 'stack overflow', 'github', 'gitlab', 'bitbucket',
            'documentation', 'docs', 'api', 'reference', 'manual', 'guide',
            'tutorial', 'how to', 'learn', 'course', 'lecture', 'lesson',
            'coursera', 'edx', 'udemy', 'udacity', 'pluralsight', 'lynda',
            'khan academy', 'codecademy', 'freecodecamp', 'leetcode', 'hackerrank',
            'scholar', 'research', 'study', 'paper', 'journal', 'article',
            'arxiv', 'pubmed', 'ieee', 'acm', 'springer', 'elsevier',
            'wikipedia', 'britannica', 'encyclopedia',
            'jira', 'confluence', 'asana', 'trello', 'notion', 'monday.com',
            'salesforce', 'hubspot', 'analytics', 'dashboard',
            'linkedin learning', 'skillshare', 'masterclass',
            'bbc news', 'cnn', 'reuters', 'bloomberg', 'financial times',
            'wall street journal', 'economist', 'nature', 'science',
        ]
        
        distracted_keywords = [
            'youtube', 'netflix', 'hulu', 'disney plus', 'prime video',
            'twitch', 'tiktok', 'instagram', 'reels', 'shorts',
            'facebook', 'twitter', 'reddit', 'pinterest', 'tumblr',
            'snapchat', 'whatsapp', 'telegram', 'discord',
            'meme', 'funny', 'lol', 'viral', 'trending', 'celebrity',
            'gossip', 'entertainment', 'buzzfeed', 'clickhole',
            '9gag', 'imgur', 'giphy',
            'game', 'gaming', 'steam', 'twitch', 'speedrun',
            'let\'s play', 'gameplay', 'walkthrough',
            'amazon', 'ebay', 'etsy', 'shop', 'buy', 'sale', 'deal',
            'cart', 'checkout', 'wishlist',
            'tinder', 'bumble', 'hinge', 'match', 'dating',
            'espn', 'nba', 'nfl', 'fifa', 'soccer', 'football',
            'highlights', 'game recap',
        ]
        
        for keyword in focused_keywords:
            if keyword in window_title:
                return 'focused'
        
        for keyword in distracted_keywords:
            if keyword in window_title:
                return 'distracted'
        
        return 'neutral'

    def update_classification(self, activity_id: int, classification: str) -> bool:
        """Update the classification field for an activity event in the database."""
        try:
            self.db_manager.update_activity_classification(activity_id, classification)
            self.logger.log(f"Updated activity {activity_id} classification to: {classification}")
            return True
        except Exception as e:
            self.logger.log_error(f"Failed to update classification for activity {activity_id}: {e}")
            return False

    def classify_recent_activities(self, limit: int = 10) -> List[Dict]:
        """Classify the most recent unclassified activities with ADHD insights."""
        try:
            unclassified = self.db_manager.get_unclassified_activities(limit)
            
            classified_records = []
            for record in unclassified:
                classification = self.classify_activity(record)
                success = self.update_classification(record['id'], classification)
                
                if success:
                    record['classification'] = classification
                    classified_records.append(record)
            
            if classified_records:
                self.logger.log(f"Classified {len(classified_records)} activities")
                
                # Check ADHD patterns after classification
                self._check_adhd_patterns()
            
            return classified_records
            
        except Exception as e:
            self.logger.log_error(f"Error classifying recent activities: {e}")
            return []
    
    def _check_adhd_patterns(self) -> None:
        """Check for ADHD-specific patterns and log warnings/suggestions."""
        # Check for hyperfocus
        hyperfocus = self.adhd_helper.detect_hyperfocus()
        if hyperfocus and hyperfocus['detected']:
            self.logger.log(hyperfocus['message'])
        
        # Check for rapid switching
        rapid_switch = self.adhd_helper.detect_rapid_switching()
        if rapid_switch and rapid_switch['detected']:
            self.logger.log(rapid_switch['message'])
        
        # Check time since last break
        break_check = self.adhd_helper.check_time_since_last_break()
        if break_check['needs_break']:
            self.logger.log(break_check['message'])
        
        # Check for task avoidance pattern
        avoidance = self.adhd_helper.detect_task_avoidance_pattern()
        if avoidance and avoidance['detected']:
            self.logger.log(avoidance['message'])
        
        # Update ADHD insights
        self.adhd_helper.update_daily_adhd_insights()

    def add_focused_app(self, app_name: str) -> None:
        """Add an application to the focused apps list."""
        self.focused_apps.add(app_name)
        self.logger.log(f"Added '{app_name}' to focused apps")

    def add_distracted_app(self, app_name: str) -> None:
        """Add an application to the distracted apps list."""
        self.distracted_apps.add(app_name)
        self.logger.log(f"Added '{app_name}' to distracted apps")

    def remove_app_classification(self, app_name: str) -> None:
        """Remove an application from all classification lists."""
        self.focused_apps.discard(app_name)
        self.distracted_apps.discard(app_name)
        self.neutral_apps.discard(app_name)
        self.logger.log(f"Removed '{app_name}' from all classifications")