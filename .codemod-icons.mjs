// One-shot codemod: react-icons → @hugeicons. Deleted after the migration.
//
// Every target below was checked by rendering it — the export names are not
// a reliable guide (ArrowRight01Icon is a bare chevron, not an arrow; there
// is no Laptop01Icon). Do not "fix" a mapping from the name alone.
import { readFileSync, writeFileSync } from 'node:fs';

export const MAP = {
  // ── arrows: Lucide's arrows have shafts, so they are the 02 family.
  //    The 01 family is the bare chevron, which is what Lu*Chevron* wants.
  LuArrowRight: 'ArrowRight02Icon',
  LuArrowLeft: 'ArrowLeft02Icon',
  LuArrowUpRight: 'ArrowUpRight01Icon',
  LuArrowDownRight: 'ArrowDownRight01Icon',
  LuChevronRight: 'ArrowRight01Icon',
  LuChevronLeft: 'ArrowLeft01Icon',
  LuChevronDown: 'ArrowDown01Icon',
  LuChevronUp: 'ArrowUp01Icon',

  // ── status
  LuLoader: 'Loading03Icon', // radiating spokes, matches Lucide's Loader
  LuCheck: 'Tick02Icon',
  LuCircleCheck: 'CheckmarkCircle02Icon',
  LuBadgeCheck: 'CheckmarkBadge01Icon',
  LuX: 'Cancel01Icon',
  LuCircleX: 'CancelCircleIcon',
  LuTriangleAlert: 'Alert02Icon',
  LuCircleAlert: 'AlertCircleIcon',
  LuInfo: 'InformationCircleIcon',

  // ── commerce
  LuShoppingBag: 'ShoppingBag03Icon',
  LuShoppingCart: 'ShoppingCart01Icon',
  LuStore: 'Store01Icon',
  LuPackage: 'Package01Icon',
  LuBox: 'CubeIcon',
  LuTruck: 'DeliveryTruck01Icon',
  LuReceipt: 'ReceiptIcon',
  LuCreditCard: 'CreditCardIcon',
  LuCircleDollarSign: 'DollarCircleIcon',
  LuTag: 'Tag01Icon',
  LuGift: 'GiftIcon',
  LuCrown: 'CrownIcon',

  // ── actions
  LuPlus: 'PlusSignIcon',
  LuMinus: 'MinusSignIcon',
  LuTrash2: 'Delete02Icon',
  LuTrash: 'Delete02Icon',
  LuSave: 'FloppyDiskIcon',
  LuUpload: 'Upload04Icon',
  LuDownload: 'Download04Icon',
  LuSearch: 'Search01Icon',
  LuFilter: 'FilterIcon',
  LuPencil: 'Edit02Icon',
  LuEdit2: 'Edit02Icon',
  LuCopy: 'Copy01Icon',
  LuShare2: 'Share08Icon',
  LuSend: 'Sent02Icon',
  LuRefreshCw: 'Refresh01Icon',
  LuRotateCcw: 'RefreshIcon',
  LuLogOut: 'Logout03Icon',
  LuEllipsis: 'MoreHorizontalIcon',

  // ── visibility / security
  LuEye: 'ViewIcon',
  LuEyeOff: 'ViewOffSlashIcon',
  LuLock: 'SquareLock02Icon', // LockIcon is a keyhole; this is the padlock
  LuShield: 'ShieldIcon',

  // ── media / files
  LuImage: 'Image01Icon',
  LuImages: 'Album02Icon',
  LuFile: 'File01Icon',
  LuFileSpreadsheet: 'FileSpreadsheetIcon',
  LuFolder: 'Folder01Icon',
  LuType: 'TextFontIcon',
  LuPalette: 'PaintBoardIcon',

  // ── comms
  LuMail: 'Mail01Icon',
  LuMailCheck: 'MailValidation01Icon',
  LuPhone: 'Call02Icon',
  LuMessageSquare: 'Message01Icon',
  LuInbox: 'InboxIcon',
  LuBell: 'Notification01Icon',
  LuMegaphone: 'Megaphone01Icon',
  LuRss: 'RssIcon',

  // ── devices
  LuSmartphone: 'SmartPhone01Icon',
  LuTablet: 'Tablet01Icon',
  LuMonitor: 'MonitorIcon',
  LuLaptop: 'ComputerIcon', // no Laptop01Icon in the free set
  LuCpu: 'CpuIcon',
  LuWifiOff: 'WifiOff01Icon',

  // ── charts / dashboard
  LuBarChart3: 'ChartColumnIcon',
  LuBarChart2: 'ChartColumnIcon',
  LuChartNoAxesColumn: 'ChartColumnIcon',
  LuChartLine: 'ChartLineIcon',
  LuActivity: 'Activity03Icon',
  LuTrendingUp: 'TrendingUpIcon',
  LuGauge: 'DashboardSpeed01Icon',
  LuLayoutDashboard: 'DashboardSquare01Icon',
  LuLayoutTemplate: 'Layout01Icon',
  LuSlidersHorizontal: 'PreferenceHorizontalIcon',
  LuSettings: 'Settings01Icon',
  LuSettings2: 'Settings02Icon',

  // ── people / places
  LuUser: 'UserIcon',
  LuUsers: 'UserMultipleIcon',
  LuBuilding: 'Building01Icon',
  LuBriefcase: 'Briefcase01Icon',
  LuGraduationCap: 'Mortarboard02Icon',
  LuPin: 'PinLocation01Icon', // LuPin is a map pin, not a pushpin
  LuGlobe: 'GlobalIcon',
  LuLanguages: 'LanguagesIcon',

  // ── misc
  LuZap: 'FlashIcon',
  LuSparkles: 'SparklesIcon',
  LuStar: 'StarIcon',
  LuHeart: 'FavouriteIcon',
  LuClock: 'Clock01Icon',
  LuCalendar: 'Calendar03Icon',
  LuSun: 'Sun01Icon',
  LuMoon: 'Moon02Icon',
  LuMenu: 'Menu01Icon',
  LuCircle: 'CircleIcon',
  LuExternalLink: 'LinkSquare02Icon',
  LuLink: 'Link01Icon',
  LuBot: 'BotIcon',
  LuCookie: 'CookieIcon',
  LuHammer: 'HammerIcon',
  LuFlower: 'Flower01Icon',
  LuShirt: 'TShirtIcon',
  LuUtensils: 'Restaurant02Icon',
  LuUtensilsCrossed: 'Restaurant02Icon',

  // ── feather duplicates of lucide shapes
  FiBarChart2: 'ChartColumnIcon',
  FiEdit2: 'Edit02Icon',

  // ── brand marks
  FaXTwitter: 'NewTwitterIcon',
  FaWhatsapp: 'WhatsappIcon',
  FaInstagram: 'InstagramIcon',
  FaFacebook: 'Facebook02Icon',
};

// FcGoogle is the multicolour Google "G". Hugeicons' GoogleIcon is a
// monochrome outline, which on a "Continue with Google" button is both a
// brand-fidelity loss and off-guideline. It gets a local component instead.
const GOOGLE = 'FcGoogle';

const HUGE_COMPONENT_IMPORT = 'import { HugeiconsIcon } from "@hugeicons/react";';

function run(file) {
  let src = readFileSync(file, 'utf8');
  const orig = src;

  const importRe = /import\s*\{([^}]*)\}\s*from\s*["']react-icons\/[a-z0-9]+["'];?[ \t]*\r?\n?/g;
  // `{ FiBarChart2 as LuBarChart3 }` — source name decides the target icon,
  // local name is what the file's body actually references.
  const imported = [];
  let m;
  while ((m = importRe.exec(src)) !== null) {
    m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((spec) => {
      const [source, local] = spec.split(/\s+as\s+/).map((s) => s.trim());
      imported.push({ source, local: local || source });
    });
  }
  if (imported.length === 0) return { file, skipped: true };

  const unmapped = imported.filter((n) => n.source !== GOOGLE && !MAP[n.source]);
  if (unmapped.length) {
    return { file, error: `unmapped: ${unmapped.map((n) => n.source).join(', ')}` };
  }

  src = src.replace(importRe, '');

  const targets = new Set();
  let usesGoogle = false;

  for (const { source, local } of imported) {
    if (source === GOOGLE) {
      usesGoogle = true;
      src = src.replace(new RegExp(`<${local}\\b`, 'g'), '<GoogleMark');
      src = src.replace(new RegExp(`</${local}>`, 'g'), '</GoogleMark>');
      src = src.replace(new RegExp(`\\b${local}\\b`, 'g'), 'GoogleMark');
      continue;
    }
    const to = MAP[source];
    targets.add(to);
    // JSX first: only the tag name changes and the data prop is injected,
    // so attributes (size/color/className/strokeWidth) carry over untouched
    // and multi-line call sites need no special case.
    src = src.replace(new RegExp(`<${local}\\b`, 'g'), `<HugeiconsIcon icon={${to}}`);
    src = src.replace(new RegExp(`</${local}>`, 'g'), '</HugeiconsIcon>');
    // Whatever is left is a bare reference held in data.
    src = src.replace(new RegExp(`\\b${local}\\b`, 'g'), to);
  }

  const needsComponent = /<HugeiconsIcon\b/.test(src) && !src.includes(HUGE_COMPONENT_IMPORT);
  const lines = [];
  if (needsComponent) lines.push(HUGE_COMPONENT_IMPORT);
  if (targets.size) {
    const existing = src.match(/import\s*\{([^}]*)\}\s*from\s*["']@hugeicons\/core-free-icons["'];?/);
    if (existing) {
      const merged = new Set([
        ...existing[1].split(',').map((s) => s.trim()).filter(Boolean),
        ...targets,
      ]);
      src = src.replace(
        existing[0],
        `import {\n  ${[...merged].join(',\n  ')},\n} from "@hugeicons/core-free-icons";`,
      );
    } else {
      lines.push(`import {\n  ${[...targets].join(',\n  ')},\n} from "@hugeicons/core-free-icons";`);
    }
  }
  if (usesGoogle) lines.push('import GoogleMark from "@/components/GoogleMark";');

  if (lines.length) {
    // Land the new imports where the removed ones were: after the last
    // import in the leading block.
    const all = [...src.matchAll(/^import .*?;$/gms)];
    if (all.length) {
      const last = all[all.length - 1];
      const at = last.index + last[0].length;
      src = src.slice(0, at) + '\n' + lines.join('\n') + src.slice(at);
    } else {
      src = lines.join('\n') + '\n' + src;
    }
  }

  if (src !== orig) writeFileSync(file, src);
  return { file, changed: src !== orig, icons: imported.length };
}

const files = process.argv.slice(2);
if (files.length) {
  let bad = 0;
  for (const f of files) {
    const r = run(f);
    if (r.error) { console.log(`✗ ${r.file}: ${r.error}`); bad++; }
    else if (r.skipped) console.log(`· ${r.file}: no react-icons`);
    else console.log(`✓ ${r.file}: ${r.icons} icons`);
  }
  process.exit(bad ? 1 : 0);
}
