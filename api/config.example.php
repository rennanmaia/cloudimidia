<?php
// Copie este arquivo para config.php e ajuste para o seu ambiente.
return [
    'app_name' => 'CloudMídia',

    // URL pública do sistema (sem barra no final). Deixe vazio para detectar automaticamente.
    // Ex.: 'https://tv.minhaempresa.com.br' ou 'http://localhost/cloudimidia'
    'app_url' => '',

    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'cloudimidia',
        'user' => 'root',
        'pass' => '',
    ],

    // Origens permitidas para chamadas de outro domínio (ex.: servidor de desenvolvimento do Vite)
    'cors_origins' => ['http://localhost:5173', 'http://127.0.0.1:5173'],

    // Sessões de login
    'token_ttl_days' => 30,

    // Permite que qualquer pessoa crie conta (modelo SaaS). Se false, só por convite.
    'allow_registration' => true,

    // Limites padrão de cada nova organização (null = ilimitado)
    'default_max_screens' => 10,
    'default_max_storage_mb' => 5120,

    // Tamanho máximo de um arquivo de mídia (MB)
    'max_upload_mb' => 1024,

    // E-mail (usa a função mail() do PHP). Quando desativado, as mensagens são gravadas em storage/logs/mail.log
    'mail_enabled' => false,
    'mail_from' => 'CloudMídia <no-reply@localhost>',

    // Verificação SSL ao buscar dados de integrações externas (notícias, clima, etc.)
    'http_verify_ssl' => true,
];
