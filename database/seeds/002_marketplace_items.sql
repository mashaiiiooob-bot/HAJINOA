-- ============================================================================
-- دست یا خالی — Marketplace starter items
-- Cosmetic items players start able to earn/buy and can later trade with each
-- other through the marketplace. Follows the pattern in 001_reference_data.sql.
-- ============================================================================
INSERT INTO items (sku, name_fa, category, price_coins, price_gems, rarity) VALUES
    ('border_golden',   'قاب طلایی',       'border',     6000, NULL, 'epic'),
    ('border_neon',     'قاب نئونی',       'border',     4500, NULL, 'rare'),
    ('frame_fire',      'قاب آتشین',       'frame',      7000, NULL, 'epic'),
    ('frame_ice',       'قاب یخی',         'frame',      7000, NULL, 'epic'),
    ('name_pink',       'نام صورتی',       'name_color', 2000, NULL, 'rare'),
    ('name_green',      'نام سبز',         'name_color', 2000, NULL, 'rare'),
    ('badge_vip',       'نشان VIP',        'badge',      NULL,   80, 'legendary'),
    ('badge_pro',       'نشان حرفه‌ای',     'badge',      9000, NULL, 'legendary')
ON CONFLICT (sku) DO NOTHING;
