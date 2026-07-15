const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
require('dotenv').config();

// Standard modular Firebase Admin imports for Node v24+ CommonJS
const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// 1. INITIALIZE DATABASES & API CLIENTS
// ==========================================

// Safely handle Firebase Admin initialization
if (getApps().length === 0) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  
  if (!serviceAccountPath) {
    console.error("❌ ERROR: GOOGLE_APPLICATION_CREDENTIALS path is missing in your .env file!");
    process.exit(1);
  }

  try {
    // Dynamically require your local JSON certificate key file
    const serviceAccount = require(`./${serviceAccountPath}`);
    
    initializeApp({
      credential: cert(serviceAccount)
    });
    console.log("🔥 Firebase Admin SDK initialized successfully using service certificate.");
  } catch (error) {
    console.error("❌ ERROR: Failed to load service account key file directly. Verify the filename in your .env.");
    console.error(error.message);
    process.exit(1);
  }
}

// Instantiate database engine wrapper using the modular factory method
const db = getFirestore();

// Initialize the OpenAI client pointing to the Fireworks AI cloud engine
const fireworks = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: 'https://api.fireworks.ai/inference/v1',
});

// ==========================================
// 2. MIDDLEWARES
// ==========================================
app.use(cors());
app.use(express.json());

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================

// Helper to generate high-dimensional vector embeddings using Fireworks AI
async function getEmbedding(text) {
  try {
    const response = await fireworks.embeddings.create({
      model: 'nomic-ai/nomic-embed-text-v1.5',
      input: text,
    });
    // Return the float coordinate array sequence
    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating vector embedding:", error);
    throw error;
  }
}

// ==========================================
// 4. API ENDPOINTS
// ==========================================

// ENDPOINT A: Core matching endpoint for HackBridge Magic Suggest
app.post('/api/magic-suggest', async (req, res) => {
  try {
    const { userSkills, availableTeams } = req.body;

    const systemPrompt = `You are the backend AI matchmaking core of HackBridge. Your task is to look at a user's skillset and grade how well they fit into available squads based on open roles and descriptions.
    
    Return a strict JSON object mapping back each teamId with a calculation score. Use a JSON schema exactly like this:
    {
      "matches": [
        { "teamId": "string", "compatibility": number }
      ]
    }`;

    const userInstructions = `
      User Skills: ${JSON.stringify(userSkills)}
      Available Teams: ${JSON.stringify(availableTeams.map(t => ({ id: t.id, name: t.name, description: t.description, openRoles: t.openRoles })))}
      
      Calculate compatibility scores from 0 to 100 for each individual team based on contextual, semantic alignment.
    `;

    const completion = await fireworks.chat.completions.create({
      model: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInstructions }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1 
    });

    const aiResponse = JSON.parse(completion.choices[0].message.content || '{}');
    res.json(aiResponse);

  } catch (error) {
    console.error("Fireworks Backend Pipeline Error:", error);
    res.status(500).json({ error: "Failed to process AI matchmaking data." });
  }
});

// ENDPOINT B: Converts team text metadata fields into vectors and updates Firestore documents
app.post('/api/update-team-vector', async (req, res) => {
  const { teamId, name, description, projectCategory, openRoles } = req.body;

  if (!teamId) {
    return res.status(400).json({ error: "Missing required parameter: teamId" });
  }

  try {
    // Assemble text data context string properties
    const rolesText = Array.isArray(openRoles) ? openRoles.join(', ') : '';
    const combinedText = `Team Name: ${name || ''}. Category: ${projectCategory || ''}. Description: ${description || ''}. Looking for roles: ${rolesText}`;
    
    // Generate mathematical coordinates matrix
    const embeddingVector = await getEmbedding(combinedText);

    // Save directly into document location fields using native vector object instantiation
    const teamRef = db.collection('teams').doc(teamId);
    await teamRef.update({
      description_vector: embeddingVector
    });

    res.json({ success: true, message: "Team vector calculated and updated successfully!" });
  } catch (error) {
    console.error("Vector Update Endpoint Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ENDPOINT C: Performs natural context search queries using firestore findNearest logic
app.post('/api/semantic-search', async (req, res) => {
  const { searchQuery } = req.body;

  try {
    if (!searchQuery || searchQuery.trim() === "") {
      return res.json({ teams: [] });
    }

    // Convert raw input search parameter criteria into single lookup search vector
    const queryVector = await getEmbedding(searchQuery);

    // Run native Cosine calculation indices directly against firestore storage limits
    const teamsCollection = db.collection('teams');
    const { VectorValue } = require('firebase-admin/firestore');
    const snapshot = await teamsCollection.findNearest({
      vectorField: 'description_vector',
      queryVector: VectorValue.create(queryVector),
      distanceMeasure: 'COSINE',
      limit: 15 
    }).get();

    const matchedTeams = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({ teams: matchedTeams });
  } catch (error) {
    console.error("Semantic Search Endpoint Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 5. SERVER BOOTSTRAP
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 HackBridge Secure Backend running locally on http://localhost:${PORT}`);
});