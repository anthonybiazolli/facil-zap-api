FROM node:20-alpine

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependência e instala
COPY package*.json ./
RUN npm install

# Copia o resto do código do frontend
COPY . .

# Expõe a porta padrão do Vite
EXPOSE 5173

# O parâmetro --host é obrigatório no Docker para o Vite aceitar conexões externas
CMD ["npm", "run", "dev", "--", "--host"]