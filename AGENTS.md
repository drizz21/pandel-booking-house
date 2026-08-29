# ACETENNIS — Website Build Specification

Tennis academy website built from a design mockup. The current repo is in early stage: only design specs exist; source code has not been created yet.

## Color Palette
- Hero background: sky blue
- Main background: white
- Body text: black/dark gray
- Accent (buttons, highlights): neon green
- Image backgrounds (dark sections): deep navy blue

## Typography
- Main heading ("PLAY STRONG"): bold, sans-serif, ALL CAPS
- Secondary heading ("BUILDING CHAMPIONS ON AND OFF THE COURT"): lighter weight
- Body text: regular weight paragraph style
- Large stat numbers ("500+", "20+", "15"): green, large display size

## Key Sections
1. **Header**: Transparent navbar, logo "ACETENNIS" left, nav links centered (Home, Training, Programs, Coaches, Tournaments, Membership), "Book a Lesson" button right (white bg, green icon)
2. **Hero**: Parallax cloud background; "PLAY STRONG" text layered behind jumping female player silhouette (cutout, no bg) but in front of clouds; "Since 1998 - Building Champions..." overlay box
3. **About**: CSS Grid layout, "BUILDING CHAMPIONS ON AND OFF THE COURT" heading, paragraph + "Book a Lesson" button (dark bg, green icon), player portrait card with stats ("500+ Active Players", "20+ Professional Coaches"), "15 Years of Excellence" with bullet list (green "15" number)
4. **Training Program**: Horizontal scroll carousel/gallery with "Beginner Training" and "Advanced Training" cards, arrow navigation controls
5. **Footer**: (to be defined)

## Animations & Interactions
- Hover effects on all nav links and "Book a Lesson" button
- Parallax cloud scrolling in hero on mouse wheel
- Slow zoom on training program cards on hover
- Counter animation for stats ("500+", "20+", "15") — animate from 0 on viewport entry

## Assets Needed (extract from design mockup)
- Sky/cloud background image
- Jumping female player silhouette (transparent PNG for text overlay)
- Male player portrait (black shirt)
- Female player hitting ball (hard court)
- Small icons for Training Program section (tennis ball, beginner session, etc.)

## Design Specs to Extract
- Padding/margin distances
- Button sizes and border-radius
- Icon placement (arrow icons in hero and program sections)
- Semi-transparent overlay backgrounds
