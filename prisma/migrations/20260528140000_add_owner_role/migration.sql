-- Role owner: operador da plataforma (taxa de split), distinto do admin da escola

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'owner';
