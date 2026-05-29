import { Global, Module } from '@nestjs/common';
import { ResendEmailService } from './resend-email.service';

@Global()
@Module({
  providers: [ResendEmailService],
  exports: [ResendEmailService],
})
export class EmailModule {}
