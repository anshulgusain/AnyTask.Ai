// update_naukri_profile.js
// Script to log into Naukri.com and update profile (headline, summary, skills, experience, education) and upload resume.
// Requires puppeteer (npm install puppeteer). Adjust selectors if Naukri UI changes.

const puppeteer = require('puppeteer');
const path = require('path');

// --------- USER CONFIGURATION ---------
const Naukri = {
  loginUrl: 'https://login.naukri.com/nLogin/Login.php', // login page URL (may redirect)
  email: 'anshulgusain99@gmail.com',
  password: '9410709010',
  profileUrl: 'https://my.naukri.com/profile', // edit profile page
  resumePath: '/Users/anshulgusain99/.gemini/antigravity/brain/ec80eba4-6221-4381-a4cb-2cdc6ee3b356/.user_uploaded/media_1793668353214_e261adb9.pdf',
};

const profileData = {
  headline: 'Gen AI Full Stack Engineer',
  summary: `Full-stack engineer with 2+ years of experience, having shipped 20+ client projects across freelance and full-time roles with React, Next.js, Node.js, and MongoDB. I add LLM features to real products, published an open-source npm CLI (autostack-ai), and built an AI chat agent for WhatsApp and Instagram.`,
  skills: [
    'React.js','Next.js','TypeScript','JavaScript','Tailwind CSS','Node.js','Express.js','REST APIs','WebSockets','Socket.IO','JWT','OAuth 2.0','MongoDB','PostgreSQL','MySQL','Prisma ORM','Redis','Firebase','Docker','GitHub Actions','Git','Gemini API','LLM Integration'
  ].join(', '),
  experience: [
    {
      title: 'Full Stack Developer',
      company: 'Venora Technology, Delhi',
      duration: 'Dec 2025 - Present',
      description: 'Delivered 10+ client web projects end‑to‑end, from requirements to production deployment, with React, Node.js, and MongoDB. Designed user flows for vague requirements, added AI‑powered features, and maintained production stability.'
    },
    {
      title: 'Full Stack Developer Intern',
      company: 'E-sutra Technology, Delhi',
      duration: 'Sep 2025 - Dec 2025',
      description: 'Built and shipped 5 full‑stack projects, owning both frontend and backend work from development through production.'
    },
    {
      title: 'Freelance Web Developer',
      company: 'Self‑employed (Remote)',
      duration: 'Dec 2024 - Sep 2025',
      description: 'Delivered 4 client websites and web apps independently with React, Node.js, and MongoDB. Managed full lifecycle: requirements, UI, backend/API, deployment, and post‑launch fixes.'
    },
    {
      title: 'Web Developer Intern',
      company: 'Slog Solution, Dehradun',
      duration: 'Jun 2024 - Dec 2024',
      description: 'Delivered 3 major client websites on the MERN stack, including authentication, REST APIs, and database design.'
    },
    {
      title: 'Technical Interviewer (Part‑time)',
      company: 'Masai School (Virtual)',
      duration: 'Feb 2023 - Jun 2024',
      description: 'Interviewed MERN stack candidates on JavaScript, React, and Node.js, providing written feedback on technical gaps.'
    }
  ],
  education: {
    degree: 'B.Tech',
    field: 'Computer Science and Engineering',
    institute: 'GRD Institute of Management and Technology, Dehradun',
    years: '2023 - 2026',
    achievement: '1st place, Ramkrishna Mission Ashram Inter‑College Debate Competition'
  }
};
// --------------------------------------

(async () => {
  const browser = await puppeteer.launch({headless: false, defaultViewport: null, args: ['--start-maximized']});
  const page = await browser.newPage();
  await page.goto(Naukri.loginUrl, {waitUntil: 'networkidle2'});

  // ----- Login -----
  // selectors may need tweaking if Naukri changes their DOM.
  await page.waitForSelector('input[name="username"], input[name="email"], input[id="username"]', {timeout: 10000}).catch(() => {});
  const emailElem = await page.$('input[name="username"]') || await page.$('input[name="email"]') || await page.$('input[id="username"]');
  if (emailElem) await emailElem.type(Naukri.email, {delay: 50});

  await page.waitForSelector('input[name="password"], input[id="password"]', {timeout: 10000}).catch(() => {});
  const passElem = await page.$('input[name="password"]') || await page.$('input[id="password"]');
  if (passElem) await passElem.type(Naukri.password, {delay: 50});

  // Click login button – common selector variants.
  const loginBtn = await page.$('button[type="submit"], input[type="submit"], button[name="login"]');
  if (loginBtn) await loginBtn.click();
  await page.waitForNavigation({waitUntil: 'networkidle2', timeout: 20000});
  console.log('✅ Logged in');

  // ----- Navigate to profile edit page -----
  await page.goto(Naukri.profileUrl, {waitUntil: 'networkidle2'});
  console.log('🔧 Opened profile page');

  // ----- Upload resume -----
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    const resumeAbsolute = path.resolve(Naukri.resumePath);
    await fileInput.uploadFile(resumeAbsolute);
    console.log('📄 Uploaded resume');
  } else {
    console.warn('⚠️ No file input found – you may need to click the “Upload Resume” button first and then select the input.');
  }

  // ----- Headline -----
  const headlineSel = await page.$('input[name="headline"], textarea[name="headline"], input#headline');
  if (headlineSel) {
    await headlineSel.click({clickCount: 3});
    await headlineSel.type(profileData.headline, {delay: 30});
    console.log('🗒️ Headline set');
  }

  // ----- Summary -----
  const summarySel = await page.$('textarea[name="summary"], textarea#summary, div[contenteditable="true"]');
  if (summarySel) {
    await summarySel.click({clickCount: 3});
    await summarySel.type(profileData.summary, {delay: 30});
    console.log('📝 Summary set');
  }

  // ----- Skills -----
  const skillsSel = await page.$('input[name="skills"], textarea[name="skills"], div[contenteditable="true"][data-field="skills"]');
  if (skillsSel) {
    await skillsSel.click({clickCount: 3});
    await skillsSel.type(profileData.skills, {delay: 30});
    console.log('🛠️ Skills set');
  }

  // ----- Experience -----
  // Try to click "Add Experience" button first if present.
  const addExpBtn = await page.$('button:contains("Add Experience"), a:contains("Add Experience"), button[data-action="add-experience"]');
  if (addExpBtn) await addExpBtn.click();

  for (let i = 0; i < profileData.experience.length; i++) {
    const exp = profileData.experience[i];
    const titleSel = await page.$(`input[name="expTitle${i+1}"]`);
    if (titleSel) await titleSel.type(exp.title, {delay: 20});
    const compSel = await page.$(`input[name="expCompany${i+1}"]`);
    if (compSel) await compSel.type(exp.company, {delay: 20});
    const durSel = await page.$(`input[name="expDuration${i+1}"]`);
    if (durSel) await durSel.type(exp.duration, {delay: 20});
    const descSel = await page.$(`textarea[name="expDesc${i+1}"]`);
    if (descSel) await descSel.type(exp.description, {delay: 20});
    if (i < profileData.experience.length - 1) {
      const nextBtn = await page.$('button:contains("Add Experience"), a:contains("Add Experience"), button[data-action="add-experience"]');
      if (nextBtn) await nextBtn.click();
    }
  }
  console.log('💼 Experience entries populated');

  // ----- Education -----
  const edu = profileData.education;
  const degreeSel = await page.$('input[name="degree"], select[name="degree"]');
  if (degreeSel) await degreeSel.type(edu.degree, {delay: 20});
  const fieldSel = await page.$('input[name="field"], input[name="course"]');
  if (fieldSel) await fieldSel.type(edu.field, {delay: 20});
  const instituteSel = await page.$('input[name="institute"], input[name="college"]');
  if (instituteSel) await instituteSel.type(edu.institute, {delay: 20});
  const yearsSel = await page.$('input[name="year"], input[name="years"]');
  if (yearsSel) await yearsSel.type(edu.years, {delay: 20});
  const achSel = await page.$('textarea[name="achievement"], textarea#achievement');
  if (achSel) await achSel.type(edu.achievement, {delay: 20});
  console.log('🎓 Education set');

  // ----- Save / Publish -----
  const saveBtn = await page.$('button:contains("Save"), button[data-action="save-profile"], input[type="submit"].save');
  if (saveBtn) {
    await saveBtn.click();
    await page.waitForTimeout(3000);
    console.log('✅ Profile saved');
  } else {
    console.warn('⚠️ Save button not found – you may need to click it manually.');
  }

  // Keep browser open briefly to let you verify.
  await page.waitForTimeout(10000);
  await browser.close();
})();

