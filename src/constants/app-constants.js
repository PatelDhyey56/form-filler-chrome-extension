(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AppConstants = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEYS = {
    DATASET: 'csv_autofiller_ext_dataset_v1',
    DEFAULTS: 'csv_autofiller_ext_defaults_v1',
    ACTIVE_TAB: 'csv_autofiller_ext_active_tab_v1',
  };

  const POPUP_ROUTES = {
    POPUP_HTML: 'src/popup/popup.html',
    CONTENT_SCRIPTS: ['src/constants/filler-constants.js', 'src/content/content-filler.js'],
  };

  const PINNED_WINDOW_SIZE = {
    WIDTH: 496,
    HEIGHT: 640,
  };

  const LIMITS = {
    MAX_RENDERED_RECORDS: 150,
    MAX_QUICK_ID_OPTIONS: 300,
    STATUS_FLASH_MS: 1200,
    SELECT2_FOLLOWUP_DELAY_MS: 280,
  };

  const SAMPLE_CSV = [
    'id,first_name,last_name,email,phone,department,role,join_date,country,employment_type,is_active,notes',
    '101,Aarav,Sharma,aarav.sharma@example.com,+91-9876543210,Engineering,Senior Backend Engineer,2024-03-15,India,Full-Time,true,"Prefers TypeScript and distributed systems."',
    '102,Maya,Patel,maya.patel@example.com,+1-415-555-0192,Product,Product Manager,2023-11-01,United States,Full-Time,true,"Leads the onboarding and checkout experience."',
    '103,Liam,O\'Connor,liam.oconnor@example.com,+44-20-7946-0921,Design,UX Designer,2025-01-20,United Kingdom,Contract,true,"Specializes in accessible forms and design systems."',
  ].join('\n');

  const ACHIEVEMENT_PRESET_MAPPINGS = {
    'Achevement Name': 'name',
    'Achievement Name': 'name',
    Name: 'name',
    'Achievement Category': 'achievementCategoryId',
    Game: 'game_ids',
    Level: 'level',
    Tier: 'level',
    Duration: 'duration',
    'Action Type': 'actionType',
    'Action Perform Count': 'action_perform_count',
    Description: 'description',
    Confirmed: 'isActive',
    Active: 'isActive',
    'Reward Auto Claim': 'isRewardAutoClaim',
    'User Specific': 'isUserSpecific',
    'Selected Mode': 'game_mode_id',
    'Selected Games': 'game_ids',
    'Reward Type': 'rewardType',
    'Reward Claim Count': 'reward_claim_count',
    'Bonus Coin': 'reward_coins',
    'Reward Game': 'reward_game_ids',
    'Bet Coin': 'bet_coin',
    'Prize Name': 'prize_name',
    Prize: 'prize_name',
  };

  const PREVIEW_HEADER_PREFERENCE_GROUPS = [
    ['game', 'gamename', 'selectedgames', 'games'],
    ['duration'],
    ['actiontype', 'action'],
    ['tier'],
    ['reward'],
    ['fullname', 'name', 'title'],
    ['firstname', 'fname'],
    ['lastname', 'lname'],
    ['email', 'mail'],
    ['phone', 'mobile', 'contact'],
    ['department', 'role', 'designation'],
    ['category', 'type', 'status', 'active', 'confirmed'],
    ['country', 'city', 'company'],
    ['description', 'desc', 'notes'],
    ['level'],
  ];

  const DATETIME_DEFAULT_KEYS = new Set([
    'displayliveat',
    'displayexpireat',
    'displaylivedate',
    'displayexpiredate',
    'livedate',
    'expiredate',
    'expirydate',
    'startdate',
    'enddate',
  ]);

  const TIME_DEFAULT_KEYS = new Set(['starttime', 'endtime']);

  return {
    STORAGE_KEYS,
    POPUP_ROUTES,
    PINNED_WINDOW_SIZE,
    LIMITS,
    SAMPLE_CSV,
    ACHIEVEMENT_PRESET_MAPPINGS,
    PREVIEW_HEADER_PREFERENCE_GROUPS,
    DATETIME_DEFAULT_KEYS,
    TIME_DEFAULT_KEYS,
  };
});
