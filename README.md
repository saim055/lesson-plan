# AI-Powered Lesson Plan Generator

An intelligent lesson planning system that generates comprehensive, curriculum-aligned lesson plans with ALN (Advanced Learning Needs) support for gifted students.

## Features

- 🎯 **AI-Powered Generation**: Uses advanced AI to create detailed lesson plans
- 📚 **Curriculum Aligned**: Supports NGSS, AP College Board, and Common Core standards
- 🎓 **ALN Support**: Advanced Learning Needs objectives for gifted students (DOK 4)
- 📁 **File Upload**: Support for PDF, DOC, DOCX files as context
- 🌍 **UAE Context**: Integrates UAE cultural and educational elements
- 📱 **Modern UI**: Responsive web interface

## Tech Stack

- **Backend**: Node.js, Express
- **AI**: Hugging Face Llama 3.1 70B
- **Document Processing**: Docxtemplater, PDF-parse, Mammoth
- **Frontend**: Vanilla JavaScript, HTML5, CSS3

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Add your HUGGINGFACE_API_KEY to .env
   ```
4. Start the server:
   ```bash
   npm start
   ```

## Environment Variables

- `HUGGINGFACE_API_KEY`: Your Hugging Face API key
- `PORT`: Server port (default: 5000)

## Usage

1. Open the web interface
2. Fill in lesson details (grade, subject, topic, etc.)
3. Optionally upload supporting files
4. Check "Gifted & Talented" for ALN objectives
5. Generate and download your lesson plan

## ALN (Advanced Learning Needs)

When gifted students are selected, the system generates DOK 4 level objectives that:
- Extend beyond regular objectives
- Involve synthesis, creation, and evaluation
- Include UAE context and applications
- Provide appropriate challenge for advanced learners

## Deployment

### Railway (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up
```

### Other Platforms
- Render
- DigitalOcean App Platform
- Heroku (paid)

## API Endpoints

- `GET /` - Web interface
- `POST /api/generate-lesson` - Generate lesson plan
- `GET /api/test` - Health check

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

© AL ADHWA PRIVATE SCHOOL
