#!/usr/bin/env node
'use strict';

const { PrismaClient } = require('@prisma/client');
const Database = require('better-sqlite3');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const { randomBytes, scryptSync } = require('crypto');
const readline = require('readline');

const adapter = new PrismaBetterSqlite3({ url: './dev.db' });
const prisma = new PrismaClient({ adapter });

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

async function main() {
  // Mode non-interactif : node create-superuser.js --username foo --password bar
  const args = process.argv.slice(2);
  let username, password;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username' && args[i + 1]) username = args[++i];
    if (args[i] === '--password' && args[i + 1]) password = args[++i];
  }

  // Mode interactif si args manquants
  if (!username || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('\n=== Création d\'un superutilisateur (ADMIN) ===\n');

    if (!username) {
      username = await ask(rl, 'Username        : ');
    }

    if (!password) {
      password = await ask(rl, 'Mot de passe    : ');
      const confirm = await ask(rl, 'Confirmation    : ');
      rl.close();

      if (password !== confirm) {
        console.error('\nErreur : les mots de passe ne correspondent pas.');
        process.exit(1);
      }
    } else {
      rl.close();
    }
  }

  if (!username) {
    console.error('Erreur : le username ne peut pas être vide.');
    process.exit(1);
  }

  if (!password || password.length < 8) {
    console.error('Erreur : le mot de passe doit faire au moins 8 caractères.');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.error(`\nErreur : l'utilisateur "${username}" existe déjà (role: ${existing.role}).`);
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: hashPassword(password),
      role: 'ADMIN',
    },
  });

  console.log('\nSuperutilisateur créé avec succès :');
  console.log(`  id       : ${user.id}`);
  console.log(`  username : ${user.username}`);
  console.log(`  role     : ${user.role}`);
  console.log(`  créé le  : ${user.createdAt.toISOString()}\n`);
}

main()
  .catch(err => {
    console.error('Erreur :', err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
