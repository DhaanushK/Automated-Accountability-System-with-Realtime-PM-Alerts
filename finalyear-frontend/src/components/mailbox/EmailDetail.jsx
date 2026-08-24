import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  Divider,
  Paper,
  Chip,
  Stack
} from '@mui/material';
import {
  Close as CloseIcon,
  Reply as ReplyIcon,
  Forward as ForwardIcon,
  AttachFile as AttachmentIcon
} from '@mui/icons-material';
import { format } from 'date-fns';

const EmailDetail = ({ email, onClose, folder }) => {
  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">{email.subject}</Typography>
        <Box>
          <IconButton onClick={() => {}} size="small">
            <ReplyIcon />
          </IconButton>
          <IconButton onClick={() => {}} size="small">
            <ForwardIcon />
          </IconButton>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Email Details */}
      <Stack spacing={1} mb={3}>
        <Box display="flex" alignItems="center">
          <Typography variant="body2" color="text.secondary" sx={{ width: 100 }}>
            From:
          </Typography>
          <Typography variant="body2">{email.from}</Typography>
        </Box>

        <Box display="flex" alignItems="center">
          <Typography variant="body2" color="text.secondary" sx={{ width: 100 }}>
            To:
          </Typography>
          <Typography variant="body2">{email.to}</Typography>
        </Box>

        {email.cc && (
          <Box display="flex" alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ width: 100 }}>
              CC:
            </Typography>
            <Typography variant="body2">{email.cc}</Typography>
          </Box>
        )}

        <Box display="flex" alignItems="center">
          <Typography variant="body2" color="text.secondary" sx={{ width: 100 }}>
            Date:
          </Typography>
          <Typography variant="body2">
            {format(new Date(email.date), 'PPpp')}
          </Typography>
        </Box>
      </Stack>

      <Divider sx={{ my: 2 }} />

      {/* Attachments */}
      {email.hasAttachments && (
        <>
          <Box mb={2}>
            <Typography variant="subtitle2" gutterBottom>
              Attachments
            </Typography>
            <Stack direction="row" spacing={1}>
              {email.attachments?.map((attachment, index) => (
                <Chip
                  key={index}
                  icon={<AttachmentIcon />}
                  label={attachment.filename}
                  variant="outlined"
                  onClick={() => {}}
                  size="small"
                />
              ))}
            </Stack>
          </Box>
          <Divider sx={{ my: 2 }} />
        </>
      )}

      {/* Email Body */}
      <Paper 
        variant="outlined" 
        sx={{ 
          p: 2,
          minHeight: '200px',
          maxHeight: '500px',
          overflow: 'auto'
        }}
      >
        {email.html ? (
          <div dangerouslySetInnerHTML={{ __html: email.html }} />
        ) : (
          <Typography whiteSpace="pre-wrap">{email.text}</Typography>
        )}
      </Paper>
    </Box>
  );
};

export default EmailDetail;