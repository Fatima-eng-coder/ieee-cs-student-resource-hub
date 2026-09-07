# IEEE CS CUI Student Resource Hub

A centralized student platform for **IEEE Computer Society – COMSATS University Islamabad**, built to make academic resources, society information, events, announcements, and student contributions easier to access and manage.

🌐 **Live Website:** [ieeecscui.vercel.app](https://ieeecscui.vercel.app)

---

## About the Project

The **IEEE CS CUI Student Resource Hub** is a full-stack web application designed for students of COMSATS University Islamabad.

It provides a single platform where students can explore academic resources, access past papers and course materials, discover IEEE CS events, browse faculty information, submit contributions, view announcements, and use campus navigation tools.

The platform also includes a protected **administrative portal** that allows authorized IEEE CS team members to manage website content and student submissions.

---

## Features

### Academic Resources

* Browse courses and course-specific resources
* Access past papers
* View course outlines, lab resources, and supporting material
* Browse faculty and teacher information
* Suggest corrections or submit missing information
* View examination date sheets

### Events

* Explore upcoming and previous IEEE CS events
* View event details
* Register for events
* Manage event registrations through the admin portal

### Past Papers

* Search and filter available papers
* View paper details
* Contribute past papers
* Request missing papers
* Admin verification and moderation workflow

### Student Contributions

Students can contribute content directly through the platform, including:

* Past papers
* Course resources
* Faculty suggestions
* Event-related submissions
* Navigation corrections
* Contact messages
* Other community resources

Submissions can be reviewed and managed through the administrative portal.

### Announcements & Quick Links

* Society and university announcements
* Important academic and student links
* Searchable centralized information

### Gallery

* Browse IEEE CS event albums
* View event photographs and memories
* Submit event-related images where supported

### IEEE CS Information

* About IEEE CS CUI
* Society hierarchy
* Previous society teams
* Timeline
* Developers and contributors

### Indoor Navigation

The project includes an interactive navigation system for the **COMSATS CS Department**.

It supports:

* Room and destination search
* Shortest-path navigation
* Multi-floor routes
* Stair and lift routing options
* Turn-by-turn directions
* Interactive floor plans
* Reporting incorrect routes

The routing engine uses **Dijkstra's shortest path algorithm** and a structured building graph.

### Authentication

The platform includes user authentication powered by **Supabase Auth**.

It supports:

* User sign up
* User login
* Session management
* Protected administrative routes
* Role-based access to management features

### Admin Portal

Authorized IEEE CS members have access to a private administrative portal for managing:

* Dashboard analytics
* Events
* Event registrations
* Courses
* Faculty
* Past papers
* Announcements
* Quick links
* Gallery
* Student submissions
* Forms and responses
* Date sheets
* Society hierarchy
* Navigation data
* Users
* Developers
* Navbar and footer content
* Website settings

---

## Tech Stack

### Frontend

* **React 19**
* **TypeScript**
* **Vite**
* **React Router**
* **Tailwind CSS**
* **Framer Motion**
* **GSAP**
* **Lucide React**
* **Three.js**
* **React Three Fiber**

### Backend & Database

* **Supabase**
* PostgreSQL
* Supabase Authentication
* Supabase Storage
* Row Level Security (RLS)
* Supabase JavaScript SDK

### Deployment

* **Vercel**

---

## Architecture

The project follows a service-based frontend architecture.

```text
UI Components / Pages
        │
        ▼
Service Layer
        │
        ▼
Supabase Client
        │
        ▼
PostgreSQL + Auth + Storage
```

Database operations are isolated inside service modules under:

```text
src/services/
```

This keeps database logic separate from React UI components and makes the application easier to maintain and extend.

---

## Project Structure

```text
ieee-cs-student-resource-hub/
│
├── public/
│
├── src/
│   ├── components/
│   │   ├── admin/
│   │   ├── cards/
│   │   ├── layout/
│   │   ├── navigation/
│   │   └── ui/
│   │
│   ├── contexts/
│   │
│   ├── data/
│   │   └── navigation/
│   │
│   ├── lib/
│   │   └── navigation/
│   │
│   ├── pages/
│   │   ├── admin/
│   │   ├── auth/
│   │   └── public/
│   │
│   ├── routes/
│   │
│   ├── services/
│   │
│   ├── types/
│   │
│   └── utils/
│
├── supabase/
│   └── migrations/
│
├── package.json
├── vite.config.ts
└── README.md
```

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/Fatima-eng-coder/ieee-cs-student-resource-hub.git
```

```bash
cd ieee-cs-student-resource-hub
```

---

### 2. Install Dependencies

```bash
npm install
```

---

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory.

```env
VITE_SUPABASE_URL=supabase_project_url
VITE_SUPABASE_ANON_KEY=supabase_publishable_key
```

You can find these values in your Supabase project settings.

> Never expose privileged Supabase service-role keys in the frontend.

---

### 4. Run the Project

```bash
npm run dev
```

The application will run locally using Vite.

---

## Available Scripts

```bash
npm run dev
```

Starts the development server.

```bash
npm run build
```

Creates a production build.

```bash
npm run preview
```

Previews the production build locally.

```bash
npm run lint
```

Runs the configured linting checks.

---

## Supabase Setup

The project uses Supabase for its backend infrastructure.

Database migrations are stored inside:

```text
supabase/migrations/
```

To connect a local copy to a Supabase project:

```bash
npx supabase init
```

Then link your project:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

Apply migrations when required:

```bash
npx supabase db push
```

---

## Security

The application uses **Supabase Row Level Security (RLS)** to control access to database records.

The frontend uses only the public Supabase publishable/anon key.

Sensitive permissions are enforced through:

* Authentication
* Database policies
* Role-based access
* Protected application routes
* Supabase Row Level Security

---

## Deployment

The production application is deployed on **Vercel**.

### Live Website

**https://ieeecscui.vercel.app**

When deploying your own version, configure the following environment variables in Vercel:

```env
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Then deploy the project normally through Vercel.

---

## Project Goals

The project aims to:

* Centralize useful academic resources for students
* Reduce reliance on scattered WhatsApp messages and shared drives
* Make IEEE CS information easily accessible
* Provide students with a simple contribution system
* Give society administrators an efficient content-management platform
* Build a maintainable digital resource that future IEEE CS teams can continue improving

---

## Future Improvements

Possible future improvements include:

* More academic resources and course material
* Improved analytics for administrators
* Enhanced student profiles
* More advanced search
* Additional navigation coverage
* Notifications for important announcements
* Progressive Web App support
* Additional automation for society workflows

---

## Contributing

Contributions and improvements are welcome.

If you would like to contribute:

1. Fork the repository.
2. Create a new branch.

```bash
git checkout -b feature/your-feature
```

3. Make your changes.
4. Commit them.

```bash
git commit -m "Add your feature"
```

5. Push your branch.

```bash
git push origin feature/your-feature
```

6. Open a Pull Request.

---

## Repository

**GitHub:**
https://github.com/Fatima-eng-coder/ieee-cs-student-resource-hub

---

## Live Demo

🌐 **IEEE CS CUI Student Resource Hub**

https://ieeecscui.vercel.app

---

## License

This project is developed for **IEEE Computer Society – COMSATS University Islamabad**.

---

<p align="center">
  Built for the IEEE CS CUI community 💻
</p>
