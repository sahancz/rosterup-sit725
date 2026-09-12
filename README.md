# RosterUp - SIT725

RosterUp is a web application for shift-cover coordination in retail and hospitality environments.

## Technologies

- Node.js
- Express.js
- MongoDB
- Mongoose
- HTML, CSS and JavaScript
- Docker
- Docker Compose

## Docker Setup

The application is containerised using Docker Compose. The setup contains two services:

- `app` - Node.js/Express RosterUp application
- `mongo` - MongoDB database

MongoDB data is stored using a Docker named volume so that database data can persist when the containers are restarted.

## Prerequisites

Install:

- Docker Desktop
- Git

Docker Desktop must be running before starting the application.

## Build and Start

Clone the repository and switch to the project branch:

```bash
git clone https://github.com/poojithayarra/rosterup-sit725.git
cd rosterup-sit725
git switch sprint1-integration