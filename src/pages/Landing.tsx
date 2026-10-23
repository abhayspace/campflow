import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BragReel from '../components/BragReel';
import { Arrow, Brand, IssueIcon } from '../components/MarketingBrand';
import { useAuth } from '../context/AuthContext';
import './landing.css';

const YEAR = new Date().getFullYear();
const ISSUES = [
  { icon: 'water', label: 'Plumbing', title: 'Leaking tap in the washroom', place: 'Main Block · Washroom', team: 'Facilities', color: 'purple' },
  { icon: 'bolt', label: 'Electricity', title: 'The corridor lights are out', place: 'Academic Block · Floor 2', team: 'Maintenance', color: 'yellow' },
  { icon: 'spark', label: 'Cleanliness', title: 'Bins need a little attention', place: 'Main canteen · East entrance', team: 'Housekeeping', color: 'pink' },
  { icon: 'wifi', label: 'Internet', title: 'Wi-Fi keeps dropping out', place: 'Central library · Reading room', team: 'IT Services', color: 'peach' },
];
const ROLES = [
  {
    name: 'Students', title: 'Your voice belongs here.',
    text: 'A report shouldn’t turn into another thing on your to-do list. Tell your campus what needs attention, check your updates, and get back to your day.',
    points: ['A ticket for every report', 'Updates without the chasing', 'The final say on the fix'],
    action: 'Join your campus', to: '/join', image: '/images/campus-community.jpg',
    caption: 'For the study sessions. And everything in between.',
  },
  {
    name: 'Teachers & staff', title: 'Good work starts with clarity.',
    text: 'Spend less time finding the details and more time getting things done. Your department queue keeps the location, context, and conversation together.',
    points: ['A clear department queue', 'Assignment and progress tools', 'A history you can refer back to'],
    action: 'Open your workspace', to: '/signin', image: '/images/study.jpg',
    caption: 'For the people who keep campus moving.',
  },
  {
    name: 'Administrators', title: 'The whole campus, in view.',
    text: 'Bring your people into a private workspace. Set up departments, invite your community, and understand where your campus needs attention.',
    points: ['Departments and routing rules', 'Invitations and access controls', 'Trends from real campus reports'],
    action: 'Set up your institution', to: '/register', image: '/images/campus.jpg',
    caption: 'For a better view of the everyday.',
  },
];
const FAQS = [
  ['How do we get our campus started?', 'An administrator registers the institution and verifies their email. Then they can create departments, set routing rules, and invite students and staff. Each institution has its own private workspace.'],
  ['I’m a student. Can I join on my own?', 'If you have an invitation, follow the link in your email. You can also request access using your institution’s code. An administrator reviews the request before you enter the workspace.'],
  ['Who can see my reports?', 'Students see their own tickets. Authorised staff see work assigned to them or their departments, and administrators manage their institution’s reports. Private staff notes are not shared with students.'],
  ['What happens if an issue isn’t fixed?', 'You can reopen a resolved ticket and explain what still needs attention. Your original report, updates, and history stay together.'],
  ['Can I submit a report without a photo?', 'Absolutely. A description and a useful location are enough to get started. Photos are optional, and you can review or correct suggested categories before submitting.'],
];

function PlayIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="m5 3 8 5-8 5V3Z" /></svg>;
}

function TicketPreview({ issue = 0, resolved = false }: { issue?: number; resolved?: boolean }) {
  const item = ISSUES[issue]!;
  return (
    <div className="ticket-example">
      <div className="ticket-example-top">
        <span className={`issue-icon ${item.color}`}><IssueIcon kind={item.icon} /></span>
        <span className={`ticket-status ${resolved ? 'done' : ''}`}>{resolved ? 'Resolved' : 'In progress'}</span>
      </div>
      <strong>{item.title}</strong>
      <span className="example-location"><IssueIcon kind="pin" />{item.place}</span>
      <div className="ticket-progress"><i /><i /><i className={resolved ? 'filled' : ''} /></div>
      <div className="ticket-example-footer"><span className="mini-avatar">A</span><span>{item.team} {resolved ? 'has fixed it.' : 'is on it.'}</span><IssueIcon kind={resolved ? 'check' : 'clock'} /></div>
    </div>
  );
}

export default function Landing() {
  const { session, profile } = useAuth();
  const workspace = session && profile ? profile.role === 'admin' ? '/admin' : profile.role === 'teacher' ? '/staff' : '/student' : '/signin';
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [issue, setIssue] = useState(0);
  const [role, setRole] = useState(0);
  const [tourOpen, setTourOpen] = useState(false);
  const [motion, setMotion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const activeRole = ROLES[role]!;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setMotion(!query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    root.current?.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const parallax = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motion || event.pointerType !== 'mouse' || !stage.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    stage.current.style.setProperty('--pointer-x', `${((event.clientX - bounds.left) / bounds.width - .5) * 14}px`);
    stage.current.style.setProperty('--pointer-y', `${((event.clientY - bounds.top) / bounds.height - .5) * 10}px`);
  };
  const resetParallax = () => {
    stage.current?.style.setProperty('--pointer-x', '0px');
    stage.current?.style.setProperty('--pointer-y', '0px');
  };

  return (
    <div ref={root} className={`campus-site ${motion ? '' : 'motion-paused'}`}>
      <a className="marketing-skip" href="#main">Skip to content</a>
      <header className="marketing-header">
        <Link to="/" aria-label="Campflow home"><Brand /></Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#platform">The platform <span>⌄</span></a>
          <a href="#community">For your campus</a>
          <a href="#how-it-works">How it works</a>
          <a href="#questions">FAQs</a>
        </nav>
        <div className="header-actions">
          <Link to={workspace} className="header-signin">{workspace === '/signin' ? 'Sign in' : 'My workspace'}</Link>
          <Link to="/register" className="site-button black small">Get started <Arrow /></Link>
          <button className="menu-toggle" aria-expanded={menuOpen} aria-controls="mobile-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? '×' : <span>☰</span>}</button>
        </div>
        {menuOpen && <nav id="mobile-menu" className="mobile-nav" aria-label="Mobile navigation" onKeyDown={(event) => { if (event.key === 'Escape') setMenuOpen(false); }}>
          <a onClick={() => setMenuOpen(false)} href="#platform">The platform <Arrow /></a>
          <a onClick={() => setMenuOpen(false)} href="#community">For your campus <Arrow /></a>
          <a onClick={() => setMenuOpen(false)} href="#questions">FAQs <Arrow /></a>
          <Link to={workspace}>{workspace === '/signin' ? 'Sign in' : 'My workspace'} <Arrow /></Link>
        </nav>}
      </header>

      <main id="main">
        <section className="landing-hero" aria-labelledby="hero-heading">
          <div className="hero-copy">
            <span className="hero-eyebrow"><span /> A little less hassle. A better campus.</span>
            <h1 id="hero-heading">Campus life moves fast.<br />Let’s keep it moving.</h1>
            <p>From the tap that won’t stop to the Wi-Fi that won’t start.<br className="desktop-break" /> Connect with the right campus team — and see things through.</p>
            <div className="hero-actions">
              <Link to="/register" className="site-button black">Get your campus started <Arrow /></Link>
              <button className="site-button outline" onClick={() => setTourOpen(true)}><PlayIcon /> See it in action</button>
            </div>
          </div>

          <div ref={stage} className="hero-stage" onPointerMove={parallax} onPointerLeave={resetParallax}>
            <div className="hero-arch"><i /><i /><i /></div>
            <div className="hero-parallax">
              <div className="hero-device" aria-label="Example Campflow mobile interface">
                <div className="device-camera" />
                <div className="device-screen">
                  <div className="device-status"><span>9:41</span><span>▮▮▮ ▰</span></div>
                  <div className="device-photo"><img src="/images/campus-community.jpg" alt="Students sharing ideas around a laptop in a library" width="1000" height="667" fetchPriority="high" /><span className="device-photo-label">The best of campus.<br /><b>More of this.</b></span></div>
                  <div className="device-content">
                    <div className="device-welcome"><strong>Your campus, connected.</strong><span className="mini-avatar">R</span></div>
                    <p>Let’s make a little room for a better day.</p>
                    <TicketPreview issue={issue} />
                    <div className="device-new"><span>+</span> Report an issue <Arrow /></div>
                  </div>
                </div>
              </div>
              <div className="hero-badge yellow-badge">
                <IssueIcon kind="clock" /><strong>A little report.<br />A lot of possibility.</strong>
                <span>Big improvements start small.</span>
              </div>
              <div className="hero-campus-card">
                <img src="/images/campus.jpg" alt="A university campus building" width="1200" height="800" />
                <span>Your campus workspace</span><strong>Everyone. Connected.</strong><div><i /><i /><i /><span>Students + staff + you</span></div>
              </div>
              <div className="hero-update"><span className="update-icon"><IssueIcon kind="check" /></span><div><strong>Report received.</strong><span>You’re in the right hands.</span></div><span className="update-dot" /></div>
              <div className="hero-badge peach-badge"><IssueIcon kind="campus" /><strong>One campus.<br />In sync.</strong><span>A shared space for a better place.</span></div>
              <div className="hero-route-list" aria-hidden="true">
                {['Report received', 'Team notified', 'You’re up to date'].map((label, index) => <div key={label} style={{ '--route-delay': `${index * .9}s` } as React.CSSProperties}><span>{index + 1}</span>{label}<IssueIcon kind="check" /></div>)}
              </div>
            </div>
          </div>

          <div className="category-strip">
            <span>EVERYDAY ISSUES. ONE PLACE.</span>
            <div className="category-buttons" aria-label="Preview a report category">
              {ISSUES.map((item, index) => <button key={item.label} onClick={() => setIssue(index)} aria-pressed={issue === index}><IssueIcon kind={item.icon} />{item.label}</button>)}
            </div>
            <div className="hero-caption"><span>Product previews use example reports.</span><button className="motion-toggle" aria-pressed={!motion} onClick={() => { setMotion(!motion); resetParallax(); }}>{motion ? 'Ⅱ Pause animations' : '▷ Enable animations'}</button></div>
          </div>
        </section>

        <section id="platform" className="platform-section page-width">
          <div className="section-heading" data-reveal>
            <span className="section-tag">LESS FRICTION. MORE CAMPUS LIFE.</span>
            <h2>A happier campus.<br />One connection at a time.</h2>
            <p>Everything you need to turn “someone should fix that” into a clear next step.</p>
          </div>

          <article className="feature-panel lavender-panel" data-reveal>
            <div className="feature-art report-art">
              <div className="report-photo"><img src="/images/student.jpg" alt="A student holding her notebooks" width="800" height="1200" loading="lazy" /><span>Better days start here.</span></div>
              <div className="report-sticker"><IssueIcon kind="message" /><strong>Your voice.<br />A real next step.</strong></div>
              <div className="report-form-preview"><span className="preview-kicker">NEW REPORT</span><strong>What needs a little attention?</strong><div><IssueIcon kind={ISSUES[issue]!.icon} />{ISSUES[issue]!.title}</div><span className="form-location"><IssueIcon kind="pin" /> {ISSUES[issue]!.place}</span><span className="preview-submit">Send report <Arrow /></span></div>
              <span className="decor-orbit" />
            </div>
            <div className="feature-copy">
              <span className="section-tag">REPORT WITHOUT THE RUNAROUND</span>
              <h3>A small report.<br />A big difference.</h3>
              <p>Tell us what’s happening, add a location, and include a photo if it helps. We’ll help organise the details. You check them, then send.</p>
              <ul><li><IssueIcon kind="check" /> Describe it in your own words</li><li><IssueIcon kind="check" /> Review everything before it’s sent</li></ul>
              <button className="site-button black small" onClick={() => setTourOpen(true)}>Take a quick look <Arrow /></button>
            </div>
          </article>

          <article className="feature-panel yellow-panel reverse" data-reveal>
            <div className="feature-art routing-art">
              <div className="department-window">
                <div className="window-header"><span className="window-dots"><i /><i /><i /></span><span>Campus workspace</span><IssueIcon kind="campus" /></div>
                <div className="window-heading"><div><span>GOOD MORNING, TEAM</span><strong>A little clarity for your day.</strong></div><span className="mini-avatar">A</span></div>
                <div className="queue-tabs"><b>Department queue</b><span>My work</span></div>
                {ISSUES.slice(0, 3).map((item, index) => <div className="queue-row" key={item.label}><span className={`issue-icon ${item.color}`}><IssueIcon kind={item.icon} /></span><div><strong>{item.title}</strong><span>{item.place}</span></div><span className="queue-status">{index === 1 ? 'Assigned' : 'New'}</span></div>)}
                <span className="window-footnote">Example department queue</span>
              </div>
              <div className="assignment-float"><span className="assignment-avatar">A</span><div><strong>Assigned to Facilities</strong><span>The right people, from the start.</span></div><IssueIcon kind="check" /></div>
              <div className="routing-bubble"><IssueIcon kind="route" /><span>Less passing around.<br /><strong>More getting it done.</strong></span></div>
            </div>
            <div className="feature-copy">
              <span className="section-tag">A PLACE FOR EVERY REPORT</span>
              <h3>The right team.<br />From the start.</h3>
              <p>Your institution’s routing rules take reports straight to the responsible department. Staff get the context they need, together in one queue.</p>
              <ul><li><IssueIcon kind="check" /> Clear ownership from day one</li><li><IssueIcon kind="check" /> Location, details, and history together</li></ul>
              <Link className="site-button black small" to="/signin">Find your workspace <Arrow /></Link>
            </div>
          </article>

          <article className="feature-panel pink-panel" data-reveal>
            <div className="feature-art tracking-art">
              <div className="tracking-photo"><img src="/images/study.jpg" alt="A student taking notes beside a laptop" width="900" height="600" loading="lazy" /><span>Back to your day.</span></div>
              <div className="tracking-card">
                <div className="tracking-card-top"><span className="issue-icon mint"><IssueIcon kind="check" /></span><span>EXAMPLE TICKET · CF-00042</span></div>
                <strong>Good news.<br />It’s been taken care of.</strong>
                <div className="tracking-timeline"><span><i /> Report received <b>✓</b></span><span><i /> Team working on it <b>✓</b></span><span><i /> Fix ready to review <b>✓</b></span></div>
                <div className="tracking-resolution">Tap cartridge replaced.<br />Water flow checked.</div>
                <span className="tracking-confirm">Looks good. Thank you! <IssueIcon kind="check" /></span>
              </div>
              <div className="tracking-badge"><IssueIcon kind="bell" /><strong>In the loop.<br />Out of the chase.</strong></div>
            </div>
            <div className="feature-copy">
              <span className="section-tag">UPDATES THAT GO SOMEWHERE</span>
              <h3>Less wondering.<br />More knowing.</h3>
              <p>Follow your report from the first update to the final fix. Get notified when things move forward, then confirm that everything’s working again.</p>
              <ul><li><IssueIcon kind="check" /> One timeline for the whole story</li><li><IssueIcon kind="check" /> Reopen it if something still isn’t right</li></ul>
              <Link className="site-button black small" to="/join">Get connected <Arrow /></Link>
            </div>
          </article>
        </section>

        <section id="how-it-works" className="how-section">
          <div className="page-width">
            <div className="section-heading" data-reveal><span className="section-tag">FROM THE FIRST REPORT TO THE FINAL FIX</span><h2>Simple enough for every day.<br />Thoughtful at every step.</h2><button className="tour-link" onClick={() => setTourOpen(true)}><span><PlayIcon /></span> Walk through an example report <Arrow /></button></div>
            <div className="steps-grid" data-reveal>
              {[
                { n: '01', icon: 'message', title: 'A place to be heard', text: 'Share what’s wrong and where. A short report is all it takes to get started.', color: 'peach' },
                { n: '02', icon: 'route', title: 'A team to take it on', text: 'The right department receives your ticket and keeps your updates in one place.', color: 'purple' },
                { n: '03', icon: 'check', title: 'A fix you can follow', text: 'Review the resolution. Confirm it’s sorted, or let your team know it needs another look.', color: 'mint' },
              ].map((item) => <article key={item.n}><div className="step-top"><span className={`issue-icon ${item.color}`}><IssueIcon kind={item.icon} /></span><span>{item.n}</span></div><h3>{item.title}</h3><p>{item.text}</p></article>)}
            </div>
            <p className="how-note"><IssueIcon kind="lock" /> Your institution’s workspace. Access shaped around your role.</p>
          </div>
        </section>

        <section id="community" className="community-section page-width">
          <div className="section-heading" data-reveal><span className="section-tag">DIFFERENT ROLES. ONE COMMUNITY.</span><h2>Campus works better<br />when we work together.</h2></div>
          <div className="community-tabs" aria-label="Choose your role">
            {ROLES.map((entry, index) => <button key={entry.name} onClick={() => setRole(index)} aria-pressed={role === index} aria-controls="community-panel">{entry.name}</button>)}
          </div>
          <div id="community-panel" className="community-panel" key={role}>
            <div className="community-photo"><img src={activeRole.image} alt={role === 0 ? 'Students collaborating in a library' : role === 1 ? 'Notes and a laptop on a desk' : 'A university campus building'} loading="lazy" width="1000" height="667" /><span>{activeRole.caption}</span></div>
            <div className="community-copy" aria-live="polite"><span className="section-tag">FOR {activeRole.name.toUpperCase()}</span><h3>{activeRole.title}</h3><p>{activeRole.text}</p><ul>{activeRole.points.map((point) => <li key={point}><IssueIcon kind="check" />{point}</li>)}</ul><Link to={activeRole.to} className="site-button black small">{activeRole.action}<Arrow /></Link></div>
          </div>
        </section>

        <section className="everyday-section page-width" data-reveal>
          <div className="section-heading"><span className="section-tag">THE LITTLE THINGS ARE THE BIG THINGS</span><h2>More time for what<br />campus is really about.</h2><p>Better spaces make room for better days.</p></div>
          <div className="everyday-grid">
            <article><div className="everyday-photo"><img src="/images/library.jpg" alt="Bookshelves in a campus library" width="800" height="533" loading="lazy" /><span className="photo-tag"><IssueIcon kind="wifi" />Connected spaces</span></div><span className="article-kicker">THE LATE-NIGHT STUDY SESSION</span><h3>Wi-Fi that keeps up.<br />A space that works.</h3><button onClick={() => { setIssue(3); setTourOpen(true); }}>Explore an internet report <Arrow /></button></article>
            <article><div className="everyday-photo"><img src="/images/campus-community.jpg" alt="Friends working together around a table" width="1000" height="667" loading="lazy" /><span className="photo-tag"><IssueIcon kind="message" />Campus conversations</span></div><span className="article-kicker">THE PEOPLE YOU SHARE IT WITH</span><h3>A stronger community.<br />One conversation at a time.</h3><Link to="/join">Find your campus <Arrow /></Link></article>
            <article><div className="everyday-photo"><img src="/images/campus.jpg" alt="Green spaces in front of a university building" width="1200" height="800" loading="lazy" /><span className="photo-tag"><IssueIcon kind="campus" />Everyday improvements</span></div><span className="article-kicker">THE PLACE YOU CALL CAMPUS</span><h3>Small improvements.<br />A place to be proud of.</h3><Link to="/register">Bring your campus together <Arrow /></Link></article>
          </div>
        </section>

        <section id="questions" className="faq-section page-width" data-reveal>
          <div className="faq-heading"><span className="section-tag">A FEW GOOD QUESTIONS</span><h2>Glad you asked.</h2><p>Here’s a little more about getting connected.</p></div>
          <div className="faq-list">{FAQS.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
        </section>

        <section className="closing-section page-width">
          <div className="closing-panel" data-reveal>
            <div className="closing-orbit orbit-left" /><div className="closing-orbit orbit-right" />
            <span className="closing-sticker sticker-left"><IssueIcon kind="message" /></span><span className="closing-sticker sticker-right"><IssueIcon kind="check" /></span>
            <span className="section-tag">A BETTER CAMPUS STARTS HERE</span>
            <h2>Good things happen<br />when we’re connected.</h2>
            <p>Give your campus a shared place to make a difference.</p>
            <div className="closing-actions"><Link to="/register" className="site-button black">Get your campus started <Arrow /></Link><Link to="/join" className="site-button outline">Join with a code</Link></div>
          </div>
        </section>
      </main>

      <footer className="marketing-footer page-width">
        <div className="footer-top"><div><Link to="/" aria-label="Campflow home"><Brand /></Link><p>A little more connected.<br />A whole lot better.</p></div><nav aria-label="Footer navigation"><a href="#platform">The platform</a><a href="#community">For your campus</a><a href="#questions">FAQs</a><Link to={workspace}>{workspace === '/signin' ? 'Sign in' : 'My workspace'}</Link></nav></div>
        <div className="footer-bottom"><span>© {YEAR} Campflow</span><span>Made for the everyday, on every campus.</span><a href="#main">Back to top ↑</a></div>
      </footer>
      <BragReel open={tourOpen} onClose={() => setTourOpen(false)} motion={motion} example={ISSUES[issue]!} />
    </div>
  );
}
