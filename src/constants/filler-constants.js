(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FillerConstants = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const IGNORED_INPUT_TYPES = new Set([
    'hidden',
    'submit',
    'button',
    'reset',
    'file',
    'image',
    'search',
  ]);

  const TRUTHY_VALUES = new Set(['true', '1', 'yes', 'y', 'on', 'active', 'checked']);
  const FALSY_VALUES = new Set(['false', '0', 'no', 'n', 'off', 'inactive', 'unchecked', '']);

  const SELECT_ALIASES = {
    xoxo: 'xoxopro',
    breezyblock: 'breezyblockspuzzle',
    brezzyblock: 'breezyblockspuzzle',
    '8ballpool': '8ballpoll',
    discfootball: 'frisbeefootball',
    discfootballer: 'frisbeefootball',
    playgame: 'gameplay',
    wingame: 'gamewin',
    losegame: 'gameloss',
    lossgame: 'gameloss',
    drawgame: 'gamedraw',
  };

  const DEFAULT_FIELD_ALIASES = {
    livedate: 'displayliveat',
    expiredate: 'displayexpireat',
    expirydate: 'displayexpireat',
    achievementname: 'name',
    achevementname: 'name',
    category: 'achievementcategoryid',
  };

  const ACHIEVEMENT_FIELD_MAP = [
    ['level', ['Level', 'Tier']],
    ['parentAchievementConfigId', ['Parent Achievement', 'parentAchievementConfigId']],
    ['isRewardAutoClaim', ['Reward Auto Claim', 'isRewardAutoClaim']],
    ['isUserSpecific', ['User Specific', 'isUserSpecific']],
    ['duration', ['Duration']],
    ['weekStartDay', ['Week Start Day', 'weekStartDay']],
    ['displayLiveAt', ['Display Live Date', 'displayLiveAt']],
    ['displayExpireAt', ['Display Expire Date', 'displayExpireAt']],
    ['startTime', ['Start Time', 'startTime']],
    ['endTime', ['End Time', 'endTime']],
    ['actionType', ['Action Type', 'actionType']],
    ['description', ['Description', 'description']],
    ['game_mode_id', ['Selected Mode', 'Game Mode', 'game_mode_id']],
    ['game_ids', ['Selected Games', 'Games', 'game_ids', 'Game']],
    ['leaderboard_ids', ['Selected Leaderboard', 'Leaderboard', 'leaderboard_ids']],
    ['profile_update_category_id', ['Selecte Profile Category', 'Profile Category', 'profile_update_category_id']],
    ['leaderboard_starting_range', ['Starting Range', 'leaderboard_starting_range']],
    ['leaderboard_ending_range', ['Ending Range', 'leaderboard_ending_range']],
    ['purchase_ids', ['Selected Products', 'Products', 'purchase_ids']],
    ['isAllCompletionRequired', ['All Completion', 'isAllCompletionRequired']],
    ['isStrickRequired', ['isStrickRequired']],
    ['game_streak', ['Game Streak', 'game_streak']],
    ['isGameRequired', ['Game Required', 'isGameRequired']],
    ['reward_claim_count', ['Reward Claim Count', 'reward_claim_count']],
    ['rewardType', ['Reward Type', 'rewardType']],
    ['reward_coins', ['Bonus Coin', 'reward_coins']],
    ['reward_game_ids', ['Reward Game', 'Reward Selected Games', 'reward_game_ids']],
    ['bet_coin', ['Bet Coin', 'bet_coin']],
    ['prize_name', ['Prize Name', 'prize_name', 'prizeName', 'Prize']],
  ];

  const LIVEWIRE_TRIGGER_MODELS = ['actionType', 'rewardType', 'achievementCategoryId', 'duration'];

  const LIVEWIRE_DYNAMIC_WRAPS = [
    '#selectGames',
    '#selectLeaderboard',
    '#selectProduct',
    '#selectProfileUpdateCategory',
    '[wire\\:model\\.live="reward_coins"]',
    '[wire\\:model\\.live="reward_game_ids"]',
    '[wire\\:model\\.live="weekStartDay"]',
    '[wire\\:model\\.live="prize_name"]',
    '[wire\\:model="prize_name"]',
    '[wire\\:model\\.live="prizeName"]',
    '[wire\\:model="prizeName"]',
  ];

  const CHROME_CONTAINER_SELECTOR = [
    'nav',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="search"]',
    '[role="contentinfo"]',
    '[role="menubar"]',
    '[role="toolbar"]',
    '.navbar',
    '.nav-bar',
    '.topbar',
    '.top-bar',
    '.app-header',
    '.app-footer',
    '.main-header',
    '.main-footer',
    '.breadcrumb',
    '.pagination',
    '.pager',
    '.dataTables_length',
    '.dataTables_filter',
    '.dataTables_paginate',
    '.dt-length',
    '.dt-search',
    '.dt-paging',
  ].join(', ');

  const SIDEBAR_CLASS_SELECTOR = [
    '[role="complementary"]',
    '.sidebar',
    '.main-sidebar',
    '.side-nav',
    '.sidenav',
    '.app-sidebar',
  ].join(', ');

  const RANDOM_POOLS = {
    firstNames: ['Aarav', 'Maya', 'Liam', 'Sofia', 'Kenji', 'Priya', 'Noah', 'Zara', 'Rohan', 'Elena'],
    lastNames: ['Sharma', 'Patel', 'Rodriguez', 'Takahashi', 'Verma', 'Walker', 'Nair', 'Bennett', 'Kapoor', 'Silva'],
    domains: ['example.com', 'mailtest.io', 'demo.org', 'sample-test.dev'],
    cities: ['Mumbai', 'Bengaluru', 'Pune', 'London', 'Austin', 'Tokyo', 'Madrid', 'Toronto'],
    states: ['Maharashtra', 'Karnataka', 'California', 'Texas', 'Ontario', 'England'],
    countries: ['India', 'United States', 'United Kingdom', 'Spain', 'Japan', 'Canada'],
    departments: ['Engineering', 'Product', 'Design', 'Operations', 'Data', 'Marketing'],
    roles: ['Software Engineer', 'Product Manager', 'QA Lead', 'UX Designer', 'Data Analyst'],
    companies: ['Apex Interactive', 'Nova Systems', 'Vertex Digital', 'Horizon Labs', 'Pulse Studio'],
    adjectives: ['Cosmic', 'Golden', 'Rapid', 'Shadow', 'Apex', 'Turbo', 'Crystal', 'Grand', 'Royal', 'Hyper'],
    nouns: ['Striker', 'Champion', 'Vanguard', 'Master', 'Voyager', 'Legend', 'Pioneer', 'Tactician', 'Winner', 'Ace'],
    prizes: ['Golden Trophy', 'Champion Badge', 'Mystery Gift Box', 'VIP Pass', 'Bonus Voucher', 'Pro Starter Pack'],
    sentences: [
      'Complete daily matches to unlock bonus rewards and climb the leaderboard.',
      'Play consecutive rounds with steady focus to earn milestone achievements.',
      'Win competitive games in public lobbies to progress this challenge.',
      'Automatically generated test description for form verification.',
    ],
  };

  return {
    IGNORED_INPUT_TYPES,
    TRUTHY_VALUES,
    FALSY_VALUES,
    SELECT_ALIASES,
    DEFAULT_FIELD_ALIASES,
    ACHIEVEMENT_FIELD_MAP,
    LIVEWIRE_TRIGGER_MODELS,
    LIVEWIRE_DYNAMIC_WRAPS,
    CHROME_CONTAINER_SELECTOR,
    SIDEBAR_CLASS_SELECTOR,
    RANDOM_POOLS,
  };
});
