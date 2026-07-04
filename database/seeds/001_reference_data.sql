-- Seed: reference data needed for the app to function out of the box.

INSERT INTO game_modes (code, name_fa, team_size, rounds_to_win) VALUES
    ('classic', 'بازی کلاسیک', 1, 2),
    ('quick',   'بازی سریع',   1, 1),
    ('duo',     'دو نفره تیمی', 2, 2),
    ('custom',  'اتاق سفارشی', 1, 2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO missions (code, title_fa, period, target_count, reward_xp, reward_coins) VALUES
    ('win_3_daily',       'در ۳ بازی برنده شوید',                 'daily',   3, 250, 0),
    ('play_10_weekly',    'انجام ۱۰ بازی',                        'weekly', 10, 300, 0),
    ('invite_friend',     'با دوستان خود ۱ بازی انجام دهید',      'weekly',  1, 200, 0),
    ('chat_5',            'در چت ۵ بار پیام ارسال کنید',          'daily',   5, 100, 0),
    ('login_daily',       'وارد بازی شوید',                       'daily',   1,  50, 0)
ON CONFLICT (code) DO NOTHING;

INSERT INTO items (sku, name_fa, category, price_coins, price_gems, rarity) VALUES
    ('frame_gold_01',    'قاب طلایی کلاسیک',  'frame',   5000,  NULL, 'rare'),
    ('frame_diamond_01', 'قاب الماس',          'frame',   NULL,    50, 'legendary'),
    ('emote_fire',       'ایموجی آتش',         'emote',   1200,  NULL, 'common'),
    ('theme_midnight',   'تم نیمه‌شب',          'theme',   8000,  NULL, 'epic')
ON CONFLICT (sku) DO NOTHING;
