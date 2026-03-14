# DevOps Solver

DevOps Solver is an AI-powered project designed to automate the process of reading, solving, and visualizing labs and homework from the DevSecOps course.

## Overview

The core idea of the project is to provide an end-to-end intelligent agent that:
- **Scrapes** the [DevSecOps-22](https://hothaifa96.github.io/DevSecOps22/) course site for labs and homework.
- **Solves** the exercises automatically using AI logic to generate step-by-step solutions.
- **Visualizes** the solutions in an interactive, terminal-style interface.

By leveraging AI, the system evaluates the requirements of each lab and produces executable flows, removing the need for manual intervention while providing an educational visual representation of the answer.

## Tech Stack Highlights

The application is built using modern web and backend technologies including Python, FastAPI, React, TypeScript, Docker, GitHub Actions and AI integrations.

## Getting Started

To run the project locally, please ensure you have Docker installed.

```bash
# Clone the repository
git clone https://github.com/guyshonshon/devops-solver.git
cd devops-solver

# Set up your environment variables
# You will need to provide an AI API key for the solver to work by creating a .env file
# Provide: GEMINI_API_KEY=<your_key>


# Start the application using Docker Compose
docker compose up --build
```

The application will be available at `http://localhost:3000`.

Planned and Built by Guy Shonshon. 
All Rights Reserved, please check out license for more information.
