import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'ana@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Ana Souza' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ minLength: 8, maxLength: 72, example: 'senha-forte-123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // limite do bcrypt: bytes além do 72º são ignorados
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ana@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token recebido no login ou na última renovação.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken!: string;
}

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['USER', 'ADMIN'] }) role!: 'USER' | 'ADMIN';
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT de curta duração, enviado em `Authorization: Bearer`.' })
  accessToken!: string;

  @ApiProperty({ description: 'Token opaco para obter novos pares de tokens. Use uma única vez.' })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' }) tokenType!: 'Bearer';
  @ApiProperty({ description: 'Validade do accessToken, em segundos.', example: 900 })
  expiresIn!: number;
  @ApiProperty({ type: UserResponseDto }) user!: UserResponseDto;
}
