// 青禾记账 - 预设分类中英文对照表
import type { Lang } from './translations';

const cat1Map: Record<string, Record<Lang, string>> = {
  '餐饮饮食': { zh: '餐饮饮食', en: 'Food & Dining' },
  '交通出行': { zh: '交通出行', en: 'Transportation' },
  '购物消费': { zh: '购物消费', en: 'Shopping' },
  '居家生活': { zh: '居家生活', en: 'Housing' },
  '通讯数码': { zh: '通讯数码', en: 'Digital & Telecom' },
  '医疗健康': { zh: '医疗健康', en: 'Health' },
  '学习成长': { zh: '学习成长', en: 'Education' },
  '休闲娱乐': { zh: '休闲娱乐', en: 'Entertainment' },
  '人情社交': { zh: '人情社交', en: 'Social' },
  '其他支出': { zh: '其他支出', en: 'Others' },

  // 收入预设
  '工资收入': { zh: '工资收入', en: 'Salary' },
  '奖金收入': { zh: '奖金收入', en: 'Bonus' },
  '投资收益': { zh: '投资收益', en: 'Investment' },
  '兼职副业': { zh: '兼职副业', en: 'Side Hustle' },
  '退款报销': { zh: '退款报销', en: 'Refund' },
  '礼金红包': { zh: '礼金红包', en: 'Gift Money' },
  '其他收入': { zh: '其他收入', en: 'Other Income' },
};

const cat2Map: Record<string, Record<Lang, string>> = {
  // 餐饮饮食
  '早餐': { zh: '早餐', en: 'Breakfast' },
  '午餐': { zh: '午餐', en: 'Lunch' },
  '晚餐': { zh: '晚餐', en: 'Dinner' },
  '零食饮料': { zh: '零食饮料', en: 'Snacks & Drinks' },
  '水果': { zh: '水果', en: 'Fruits' },
  '外卖': { zh: '外卖', en: 'Takeout' },
  '聚餐请客': { zh: '聚餐请客', en: 'Dining Out' },

  // 交通出行
  '公交地铁': { zh: '公交地铁', en: 'Public Transit' },
  '打车': { zh: '打车', en: 'Taxi/Rideshare' },
  '加油停车': { zh: '加油停车', en: 'Gas & Parking' },
  '共享单车': { zh: '共享单车', en: 'Bike Share' },
  '火车飞机': { zh: '火车飞机', en: 'Train & Flight' },
  '车辆养护': { zh: '车辆养护', en: 'Car Maintenance' },

  // 购物消费
  '服装鞋帽': { zh: '服装鞋帽', en: 'Clothing & Shoes' },
  '护肤美妆': { zh: '护肤美妆', en: 'Beauty & Skincare' },
  '数码电器': { zh: '数码电器', en: 'Electronics' },
  '日用品': { zh: '日用品', en: 'Daily Essentials' },
  '家居软装': { zh: '家居软装', en: 'Home Decor' },
  '箱包配饰': { zh: '箱包配饰', en: 'Bags & Accessories' },

  // 居家生活
  '房租房贷': { zh: '房租房贷', en: 'Rent/Mortgage' },
  '水电气': { zh: '水电气', en: 'Utilities' },
  '物业': { zh: '物业', en: 'Property Fee' },
  '家电维修': { zh: '家电维修', en: 'Appliance Repair' },
  '保洁家政': { zh: '保洁家政', en: 'Cleaning' },

  // 通讯数码
  '手机话费': { zh: '手机话费', en: 'Mobile Bill' },
  '宽带上网': { zh: '宽带上网', en: 'Internet' },
  '流量充值': { zh: '流量充值', en: 'Data Top-up' },
  '数码设备': { zh: '数码设备', en: 'Digital Devices' },
  '软件会员': { zh: '软件会员', en: 'Software Subscriptions' },
  '云盘存储': { zh: '云盘存储', en: 'Cloud Storage' },

  // 医疗健康
  '门诊就医': { zh: '门诊就医', en: 'Doctor Visit' },
  '买药': { zh: '买药', en: 'Medicine' },
  '体检': { zh: '体检', en: 'Health Checkup' },
  '健身': { zh: '健身', en: 'Fitness' },
  '保险': { zh: '保险', en: 'Insurance' },

  // 学习成长
  '书籍': { zh: '书籍', en: 'Books' },
  '课程培训': { zh: '课程培训', en: 'Courses & Training' },
  '文具': { zh: '文具', en: 'Stationery' },
  '考试报名': { zh: '考试报名', en: 'Exam Fees' },

  // 休闲娱乐
  '影音': { zh: '影音', en: 'Movies & Music' },
  '游戏': { zh: '游戏', en: 'Games' },
  '旅行': { zh: '旅行', en: 'Travel' },
  '宠物': { zh: '宠物', en: 'Pets' },
  '运动户外': { zh: '运动户外', en: 'Sports & Outdoors' },

  // 人情社交
  '红包礼金': { zh: '红包礼金', en: 'Red Packets & Gifts' },
  '孝敬父母': { zh: '孝敬父母', en: 'Support Parents' },
  '聚会社交': { zh: '聚会社交', en: 'Social Gatherings' },
  '慈善捐赠': { zh: '慈善捐赠', en: 'Donations' },

  // 其他支出
  '其他杂项': { zh: '其他杂项', en: 'Miscellaneous' },
  '手续费': { zh: '手续费', en: 'Service Fee' },
  '临时支出': { zh: '临时支出', en: 'Temporary' },
};

export function translateCategory(lang: Lang, name: string): string {
  if (!name) return '';
  const entry = cat1Map[name] || cat2Map[name];
  if (entry) return entry[lang] || name;
  return name;
}
